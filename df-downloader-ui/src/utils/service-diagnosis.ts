import { API_URL } from "../config";
import { DfUiError } from "./error";

/**
 * Working out *why* the UI can't reach the service, rather than guessing.
 *
 * The page this feeds is, for a misconfigured install, the only thing the user
 * ever sees - so it has to name the actual problem. Four different faults used
 * to produce the same wall of text, and only one of them was a CORS error.
 *
 * What the browser will and won't tell us
 * ---------------------------------------
 * `fetch()` deliberately collapses every transport-level failure into the same
 * opaque `TypeError: Failed to fetch`. Nothing is listening, the host doesn't
 * resolve, a firewall dropped it, an extension blocked it, or the service
 * answered and the browser threw the response away for want of an
 * `Access-Control-Allow-Origin` header - all identical from script. That is a
 * privacy guarantee, not an oversight, and no amount of reading the error will
 * get around it.
 *
 * One thing does get around it: a second request with `mode: "no-cors"`. CORS
 * isn't applied to those, so the request goes out and an *opaque* response
 * comes back if anything at all answered. Measured (2026-08-28, Chromium):
 *
 *   nothing listening   cors: TypeError    no-cors: TypeError
 *   listening, no ACAO  cors: TypeError    no-cors: opaque response
 *
 * So "did anything answer at that address" is recoverable even though "what did
 * it say" is not. That single bit is what separates "the service is down" from
 * "the service is up and CORS is misconfigured" - the two faults with
 * completely different fixes that the old page merged into one guess.
 *
 * The rest is inference from things we can see directly: the HTTP status if we
 * got one, whether the API origin baked into this bundle matches the origin the
 * page was served from, and whether that API origin is one only the server
 * itself could resolve. That last check catches the single most common
 * self-hosted misconfiguration - PUBLIC_ADDRESS left at its default, so the
 * bundle tells every browser to call the API on `localhost`, meaning the
 * machine the user is sitting at.
 *
 * Everything here stays hedged where the evidence is circumstantial. An opaque
 * probe proves something answered, not that it was DF Downloader.
 */

/** How far a `mode: "no-cors"` reachability probe got. */
export type ProbeState =
  /** Still in flight. */
  | "pending"
  /** Not worth running - we already have a real HTTP response. */
  | "skipped"
  /** An opaque response came back: something is listening there. */
  | "answered"
  /** It failed the same way the real request did: nothing answered. */
  | "silent"
  /** It neither answered nor failed within the timeout - black-holed. */
  | "timeout";

export type DiagnosisKind =
  /** No error yet - the first request is still in flight. */
  | "connecting"
  /** A failure, but the reachability probe hasn't reported back yet. */
  | "probing"
  /** The browser itself reports no network at all. */
  | "offline"
  /** An https page may not call an http API; blocked before it leaves. */
  | "mixed-content"
  /** The API address is one only the server could resolve (localhost etc). */
  | "loopback-mismatch"
  /** Something is listening, but the browser rejected its reply. */
  | "cors"
  /** Nothing answered at the API address. */
  | "unreachable"
  /** The service answered, with an error status. */
  | "service-error"
  /** Something answered, but not with anything this app recognises. */
  | "bad-response"
  /** Reachable, same-origin, and still refused - out of ordinary causes. */
  | "blocked";

export type DiagnosisFix = {
  /** One line of context above the block. */
  caption: string;
  /** The thing to copy. */
  code: string;
  /** Shown under the block where the value needs explaining. */
  note?: string;
};

export type Diagnosis = {
  kind: DiagnosisKind;
  headline: string;
  summary: string;
  /**
   * False whenever the browser genuinely can't tell this case from another
   * one. The page leads with "Most likely" rather than stating it as fact.
   */
  certain: boolean;
  fixes: DiagnosisFix[];
};

export type LinkFacts = {
  /** The API address compiled into this bundle. */
  apiUrl: string;
  apiOrigin: string;
  apiHost: string;
  /** Where the page itself came from. */
  pageOrigin: string;
  sameOrigin: boolean;
  /**
   * The API host is one that only ever means "the machine asking" - so a
   * browser on any other machine can never reach the service through it.
   */
  apiIsLocalOnly: boolean;
  pageIsLocalOnly: boolean;
  /** https page, http API - blocked by the browser before it is sent. */
  mixedContent: boolean;
  online: boolean;
  /** Set when the service answered with an HTTP status of its own. */
  status: number | null;
  /** Whatever the service or the fetch layer said, verbatim. */
  errorMessage: string | null;
  /** A reply came back, even if it was unusable. Implies the address is live. */
  reachedService: boolean;
  probe: ProbeState;
};

const LOCAL_ONLY_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", ""]);

const isLocalOnlyHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return LOCAL_ONLY_HOSTS.has(host) || host.startsWith("127.") || host.endsWith(".localhost");
};

/** `HTTP error 502: Bad Gateway` - what fetch.ts builds when there's no JSON body. */
const HTTP_ERROR_MESSAGE = /^HTTP error (\d{3})\b/;

/**
 * The HTTP status, if the service got far enough to send one. Comes through as
 * a numeric `code` when the service returned its own JSON error envelope, and
 * only as prose in the message when it didn't.
 */
export const extractStatus = (error: DfUiError | null | undefined): number | null => {
  if (!error) {
    return null;
  }
  if (typeof error.code === "number" && error.code >= 100 && error.code <= 599) {
    return error.code;
  }
  const match = typeof error.message === "string" ? HTTP_ERROR_MESSAGE.exec(error.message) : null;
  return match ? Number(match[1]) : null;
};

/**
 * Whether a reply came back at all, however unusable it turned out to be.
 *
 * This reads the app's own error taxonomy rather than sniffing the browser's
 * message strings, which vary per engine. `fetchJson` only reaches its parse
 * and schema steps once it holds a response, so those two codes are proof one
 * arrived:
 *
 *   FETCH_ERROR + no status   nothing came back (refused, blocked, dropped)
 *   FETCH_ERROR + a status    the service answered with that status
 *   PARSE_ERROR               a reply arrived and wasn't JSON
 *   UNKNOWN_ERROR             a reply arrived, was JSON, wrong shape (zod threw)
 *
 * Known gap: a non-2xx reply whose JSON body carries `error` as a bare string
 * rather than the service's `{message, code}` envelope loses its status inside
 * `createDfUiError`, and lands here looking like a transport failure. The
 * service itself always sends the envelope (`makeErrorResponse`), so this only
 * bites when something that isn't the service is answering - in which case the
 * probe still reports the address as reachable and the page still says so.
 */
export const gotResponse = (error: DfUiError | null | undefined) =>
  Boolean(error) && (extractStatus(error) !== null || error?.code === "PARSE_ERROR" || error?.code === "UNKNOWN_ERROR");

/** True when we never got an HTTP response at all, so a probe is worth running. */
export const isTransportFailure = (error: DfUiError | null | undefined) =>
  Boolean(error) && !gotResponse(error);

export const getLinkFacts = (error: DfUiError | null | undefined, probe: ProbeState): LinkFacts => {
  const page = new URL(window.location.href);
  // API_URL is absolute in a real install (the service substitutes
  // PUBLIC_ADDRESS into the bundle as it serves it) but relative in dev, where
  // vite proxies /api. Resolving against the page handles both.
  const api = new URL(API_URL, window.location.href);
  const status = extractStatus(error);
  return {
    apiUrl: api.href,
    apiOrigin: api.origin,
    apiHost: api.hostname,
    pageOrigin: page.origin,
    sameOrigin: api.origin === page.origin,
    apiIsLocalOnly: isLocalOnlyHost(api.hostname),
    pageIsLocalOnly: isLocalOnlyHost(page.hostname),
    mixedContent: page.protocol === "https:" && api.protocol === "http:",
    // Reliable only in the negative: `true` just means an interface is up.
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
    status,
    errorMessage: error?.message ?? null,
    reachedService: gotResponse(error),
    probe,
  };
};

const allowOriginFix = (f: LinkFacts): DiagnosisFix => ({
  caption: "Or, to leave PUBLIC_ADDRESS alone and just permit this origin, in config.yaml:",
  code: `rest:\n  allowOrigin:\n    - ${f.pageOrigin}`,
  note: "A single value works too, and ALLOW_ORIGIN does the same job as an environment variable.",
});

const publicAddressFix = (f: LinkFacts): DiagnosisFix => ({
  caption: "Set this on the container and restart it - it is the address you type in the browser:",
  code: `PUBLIC_ADDRESS=${f.pageOrigin}`,
  note: `The bundle currently calls ${f.apiOrigin}.`,
});

export const diagnose = (f: LinkFacts, hasError: boolean): Diagnosis => {
  if (!hasError) {
    return {
      kind: "connecting",
      headline: "Connecting to the service",
      // Also the defensive case: no error recorded and nothing in flight. That
      // shouldn't be reachable through App.tsx, but the page used to render an
      // empty box if it ever happened, so it says something either way - and
      // the retry below is always available.
      summary:
        "Waiting for a reply from the backend. What was checked, and what came back, appears here as soon as there is anything to report.",
      certain: true,
      fixes: [],
    };
  }

  if (!f.online) {
    return {
      kind: "offline",
      headline: "This browser has no network connection",
      summary:
        "The browser reports that it is offline, so nothing left this machine. The service is probably fine - reconnect and this page will pick it up on its own.",
      certain: true,
      fixes: [],
    };
  }

  if (f.mixedContent) {
    return {
      kind: "mixed-content",
      headline: "The browser blocked the request as insecure",
      summary: `This page was served over https, but it is set up to call the API over plain http at ${f.apiOrigin}. Browsers refuse that combination and stop the request before it is sent, so the service never hears about it. Both need to be on the same scheme.`,
      certain: true,
      fixes: [
        {
          caption: "Point PUBLIC_ADDRESS at the https address you are actually using:",
          code: `PUBLIC_ADDRESS=${f.pageOrigin}`,
        },
      ],
    };
  }

  if (f.status !== null) {
    return {
      kind: "service-error",
      headline: `The service answered with an error (${f.status})`,
      summary: `The connection is fine - the request reached the service and it replied ${f.status}. This is the service itself failing rather than anything about addresses or CORS, so the container log is where the reason will be.${
        f.errorMessage ? ` It said: "${f.errorMessage}".` : ""
      }`,
      certain: true,
      fixes: [
        {
          caption: "Check what the service logged around the time of this request:",
          code: "docker logs --tail 100 df-downloader",
        },
      ],
    };
  }

  if (f.reachedService) {
    // A reply arrived and made no sense - so the address is live, CORS is
    // evidently fine, and whatever is on the other end is not this service.
    return {
      kind: "bad-response",
      headline: "Something answered, but it wasn't DF Downloader",
      summary: `The request reached ${f.apiOrigin} and something replied, but the reply was not in a shape this app recognises. That normally means something other than the service is listening on that port - another container, a router's admin page, or a proxy serving its own error page. Check the port, and if there is a reverse proxy in front, that it sends /api to the service rather than swallowing it.`,
      certain: false,
      fixes: f.errorMessage
        ? [{ caption: "What came back could not be read as a service response:", code: f.errorMessage }]
        : [],
    };
  }

  // Don't assert a cause before the measurement it rests on has come back.
  // The probe settles in well under a second against a refused port, but a
  // dropped one takes the full timeout, and claiming "nothing answered" for
  // those six seconds would sometimes be a lie the page then quietly retracts.
  if (f.probe === "pending") {
    return {
      kind: "probing",
      headline: "Checking what is at that address",
      summary: `The request to ${f.apiOrigin} failed. Trying it again without any CORS restrictions, which will tell us whether anything is listening there - that is the difference between a service that is down and one that is running but refusing this page.`,
      certain: true,
      fixes: [],
    };
  }

  if (f.probe === "answered") {
    if (!f.sameOrigin) {
      return {
        kind: "cors",
        headline: "The service is answering, but the browser is discarding its replies",
        summary: `Something is listening at ${f.apiOrigin} and responded. The browser then threw the response away without letting this page read it, which almost always means the service has not been told to accept requests from ${f.pageOrigin}. The exact reason is printed in the browser's own console - this page is not allowed to see it.`,
        certain: false,
        fixes: [publicAddressFix(f), allowOriginFix(f)],
      };
    }
    return {
      kind: "blocked",
      headline: "Something answered, but the request never completed",
      summary: `The page and the API are both on ${f.pageOrigin}, so this is not a CORS problem. Something at that address responded to a plain request but not to this one - a browser extension, an ad blocker, or a proxy sitting in front of the service are the usual causes. The browser console will have the real reason.`,
      certain: false,
      fixes: [],
    };
  }

  // Everything below here is a transport failure the probe could not reach
  // either. The specific cause is hidden from us, so lead with whatever the
  // addresses themselves make most likely.
  if (f.apiIsLocalOnly && !f.pageIsLocalOnly) {
    return {
      kind: "loopback-mismatch",
      headline: "This page is calling the API on the wrong machine",
      summary: `You loaded the page from ${f.pageOrigin}, but the API address built into it is ${f.apiOrigin}. In your browser, "${f.apiHost}" means the computer you are sitting at - not the server - so the request never leaves this machine and finds nothing when it arrives. This is what happens when PUBLIC_ADDRESS is left unset: the service falls back to localhost and hands that address to every browser that loads the UI.`,
      certain: false,
      fixes: [publicAddressFix(f), allowOriginFix(f)],
    };
  }

  const timedOut = f.probe === "timeout";
  return {
    kind: "unreachable",
    headline: `Nothing answered at ${f.apiOrigin}`,
    summary: `${
      timedOut
        ? "The address accepted the request and then went quiet, which usually means a firewall is dropping it rather than refusing it."
        : "A second request sent without any CORS restrictions failed exactly the same way, so there is most likely nothing listening at that address."
    } Check that the service is running, that its port is published, and that ${
      f.apiHost
    } is reachable from this machine. A CORS rejection cannot be completely ruled out - the browser reports a blocked reply and a dead address identically - but a rejection normally still produces a reply, and this address produced none.`,
    certain: false,
    fixes: [
      {
        caption: "Check the container is up and the port is published:",
        code: "docker ps --filter name=df-downloader",
      },
      ...(f.sameOrigin ? [] : [publicAddressFix(f)]),
    ],
  };
};

/**
 * Ask whether anything at all is listening, without CORS in the way.
 *
 * `mode: "no-cors"` means we can never read the response - that is the point.
 * Resolving at all tells us something answered; that is the single bit the
 * ordinary request cannot give us. Credentials are omitted so this can't
 * disturb the session, and the timeout keeps a black-holed host from leaving
 * the page saying "checking" forever.
 */
export const probeReachable = async (apiUrl: string, timeoutMs = 6000): Promise<ProbeState> => {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    await fetch(apiUrl, {
      mode: "no-cors",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });
    return "answered";
  } catch {
    return timedOut ? "timeout" : "silent";
  } finally {
    clearTimeout(timer);
  }
};
