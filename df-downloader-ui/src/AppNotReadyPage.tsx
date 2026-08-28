import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DoneIcon from "@mui/icons-material/Done";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Box, Button, Collapse, IconButton, Link, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { SpinnyDiv } from "./components/general/spinny.component.tsx";
import { RichIcon } from "./icons/rich-icon.component.tsx";
import { selectIsLoading } from "./store/general.selector.ts";
import { queryServiceInfo } from "./store/service-info/service-info.actions.ts";
import { selectServiceError } from "./store/service-info/service-info.selector.ts";
import { store } from "./store/store.ts";
import { monoFontFamily } from "./themes/build-theme.ts";
import { DfUiError } from "./utils/error.ts";
import {
  Diagnosis,
  DiagnosisFix,
  getLinkFacts,
  isTransportFailure,
  LinkFacts,
  probeReachable,
  ProbeState,
  diagnose,
} from "./utils/service-diagnosis.ts";
import { API_URL } from "./config.ts";

/**
 * The screen shown when the UI has loaded but can't reach the service.
 *
 * For a self-hosted install with a wrong address in its config this is the
 * first and only thing anyone sees, so it is written to be sufficient on its
 * own - someone who has just started the container on Unraid with the wrong
 * PUBLIC_ADDRESS should be able to fix it from here without the README.
 *
 * Three things drive the layout. It leads with a diagnosis rather than a list
 * of everything that could conceivably be wrong (see service-diagnosis.ts for
 * how the failure modes are told apart, and which ones genuinely can't be).
 * It shows the measurements the diagnosis was drawn from, so a wrong guess is
 * still useful - the addresses alone often give it away. And it stays calm:
 * a homelab tool that can't reach its backend is routine, so this is a panel
 * with a status line, not a red wall.
 */

const RETRY_SECONDS = 30;
const ISSUES_URL = "https://github.com/ConcreteLlama/digital-foundry-downloader/issues";

export const AppNotReadyPage = () => {
  const checking = useSelector(selectIsLoading("serviceInfo"));
  const serviceError = useSelector(selectServiceError);

  /*
   * A retry clears the error before the next one arrives, so reading the live
   * error would blank the whole diagnosis for as long as each check takes and
   * then rebuild it - a visible flicker every 30 seconds, which is what the
   * page used to do (it swapped the entire panel for a bare spinner). Holding
   * the last failure keeps the page still while the status line does the
   * talking.
   */
  const [lastError, setLastError] = useState<DfUiError | null>(serviceError ?? null);
  useEffect(() => {
    if (serviceError) {
      setLastError(serviceError);
    }
  }, [serviceError]);

  const probe = useReachabilityProbe(lastError);
  const facts = useMemo(() => getLinkFacts(lastError, probe), [lastError, probe]);
  const diagnosis = useMemo(() => diagnose(facts, Boolean(lastError)), [facts, lastError]);
  const { secondsLeft, retryNow } = useRetryLoop(checking);

  /*
   * Each retry re-runs the probe, which would otherwise swap the headline back
   * to "checking what is at that address" for a second every 30 seconds. The
   * prose holds still at the last thing we actually concluded; the trace row
   * and the status line carry the live state, which is the right split - the
   * instrument moves, the explanation doesn't.
   */
  const settledRef = useRef<Diagnosis | null>(null);
  if (diagnosis.kind !== "probing" && diagnosis.kind !== "connecting") {
    settledRef.current = diagnosis;
  }
  const shown = diagnosis.kind === "probing" && settledRef.current ? settledRef.current : diagnosis;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: { xs: "flex-start", md: "center" },
        justifyContent: "center",
        px: { xs: 1.5, md: 3 },
        py: { xs: 3, md: 4 },
        bgcolor: "background.default",
      }}
    >
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: 760, overflow: "hidden" }}>
        <PanelHeader checking={checking} diagnosis={diagnosis} />

        <Box sx={{ px: { xs: 2, md: 3 }, py: { xs: 2.5, md: 3 } }}>
          <Typography
            variant="overline"
            sx={{ display: "block", color: "text.disabled", fontFamily: monoFontFamily }}
          >
            {shown.kind === "connecting" || shown.kind === "probing"
              ? "Status"
              : shown.certain
                ? "Diagnosis"
                : "Most likely"}
          </Typography>
          <Typography variant="h3" sx={{ mt: 0.5, color: "text.primary" }}>
            {shown.headline}
          </Typography>
          <Typography variant="body1" sx={{ mt: 1.5, color: "text.secondary", maxWidth: "62ch" }}>
            {shown.summary}
          </Typography>

          <Trace facts={facts} sx={{ mt: 3 }} />

          {shown.fixes.length > 0 && (
            <Stack spacing={2.5} sx={{ mt: 3 }}>
              {shown.fixes.map((fix, index) => (
                <Fix key={index} fix={fix} />
              ))}
            </Stack>
          )}

          <OtherThingsToCheck diagnosis={shown} facts={facts} />
        </Box>

        <PanelFooter checking={checking} secondsLeft={secondsLeft} onRetry={retryNow} />
      </Paper>
    </Box>
  );
};

/* ------------------------------------------------------------------ timing */

/**
 * One timer, and it resets.
 *
 * The old one counted 30 -> 0 and then stayed at 0: the countdown only ever
 * went back up because the component happened to unmount while a retry was in
 * flight, which stopped being true the moment the panel was made to stay put.
 * Deadline-based rather than decrement-based so it can't drift away from the
 * request it is predicting, and it holds still while a check is actually
 * running rather than counting down towards a retry it won't fire.
 */
const useRetryLoop = (checking: boolean) => {
  const [secondsLeft, setSecondsLeft] = useState(RETRY_SECONDS);
  const deadlineRef = useRef(Date.now() + RETRY_SECONDS * 1000);
  // Read through a ref so the interval is created once and lives for the life
  // of the page, instead of being torn down and rebuilt on every poll.
  const checkingRef = useRef(checking);
  checkingRef.current = checking;

  const restart = useCallback(() => {
    deadlineRef.current = Date.now() + RETRY_SECONDS * 1000;
    setSecondsLeft(RETRY_SECONDS);
  }, []);

  const retryNow = useCallback(() => {
    restart();
    store.dispatch(queryServiceInfo.start());
  }, [restart]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (checkingRef.current) {
        // A check is already in flight - don't queue another behind it.
        restart();
        return;
      }
      const remaining = Math.ceil((deadlineRef.current - Date.now()) / 1000);
      if (remaining > 0) {
        setSecondsLeft(remaining);
        return;
      }
      restart();
      store.dispatch(queryServiceInfo.start());
    }, 250);
    return () => clearInterval(interval);
  }, [restart]);

  return { secondsLeft, retryNow };
};

/**
 * Runs the no-cors reachability probe whenever a new failure arrives, and only
 * when there is something to learn - if the service answered with a status,
 * we already know it is reachable.
 */
const useReachabilityProbe = (error: DfUiError | null): ProbeState => {
  const [probe, setProbe] = useState<ProbeState>("pending");
  useEffect(() => {
    if (!error) {
      setProbe("pending");
      return;
    }
    if (!isTransportFailure(error)) {
      setProbe("skipped");
      return;
    }
    let cancelled = false;
    setProbe("pending");
    probeReachable(API_URL).then((result) => {
      if (!cancelled) {
        setProbe(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [error]);
  return probe;
};

/* ------------------------------------------------------------------- chrome */

/**
 * Rich, spinning while a check is in flight and sitting still the rest of the
 * time. The spinning Rich is the app's loading indicator everywhere else and
 * is deliberately funny, so this page keeps it rather than replacing it with
 * an anonymous spinner - it just gets a job to do here, which is to show at a
 * glance whether anything is actually happening.
 */
const LinkMark = ({ spinning }: { spinning: boolean }) => {
  const mark = (
    <RichIcon
      width={22}
      height={22}
      style={{ display: "block", borderRadius: "50%" }}
      alt={spinning ? "Checking the connection" : "Not connected"}
    />
  );
  return (
    <Box sx={{ flexShrink: 0, opacity: spinning ? 1 : 0.55, transition: "opacity .3s" }}>
      {spinning ? <SpinnyDiv>{mark}</SpinnyDiv> : mark}
    </Box>
  );
};

const PanelHeader = ({ checking, diagnosis }: { checking: boolean; diagnosis: Diagnosis }) => {
  const live = checking || diagnosis.kind === "connecting" || diagnosis.kind === "probing";
  const label = checking
    ? "checking"
    : diagnosis.kind === "connecting"
      ? "waiting"
      : diagnosis.kind === "probing"
        ? "diagnosing"
        : "no connection";
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        px: { xs: 2, md: 3 },
        py: 1.25,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.default",
      }}
    >
      <Stack direction="row" sx={{ alignItems: "center", gap: 1.25, minWidth: 0 }}>
        <LinkMark spinning={live} />
        <Typography
          variant="overline"
          noWrap
          sx={{ fontFamily: monoFontFamily, letterSpacing: "0.12em", color: "text.disabled" }}
        >
          DF Downloader
          {/* Dropped on a phone rather than left to truncate to "· serv…". */}
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
            {" · service link"}
          </Box>
        </Typography>
      </Stack>
      <Stack direction="row" sx={{ alignItems: "center", gap: 0.75, flexShrink: 0 }}>
        {/*
          Amber rather than red - this is a routine misconfiguration, not an
          outage worth alarming anyone about.
        */}
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            bgcolor: live ? "primary.main" : "warning.main",
            animation: live ? "df-link-pulse 1.4s ease-in-out infinite" : "none",
            "@keyframes df-link-pulse": {
              "0%, 100%": { opacity: 1 },
              "50%": { opacity: 0.25 },
            },
          }}
        />
        <Typography
          sx={{
            fontFamily: monoFontFamily,
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: live ? "primary.main" : "warning.main",
          }}
        >
          {label}
        </Typography>
      </Stack>
    </Stack>
  );
};

const PanelFooter = ({
  checking,
  secondsLeft,
  onRetry,
}: {
  checking: boolean;
  secondsLeft: number;
  onRetry: () => void;
}) => {
  const elapsedFraction = checking ? 0 : (RETRY_SECONDS - secondsLeft) / RETRY_SECONDS;
  return (
    <Box sx={{ borderTop: "1px solid", borderColor: "divider" }}>
      {/*
        The countdown as the panel's own bottom edge rather than a sentence
        about it - the same trick the library rows use for a download in
        progress. It says "still going" without occupying a line.
      */}
      <Box sx={{ height: 2, bgcolor: "background.default", position: "relative" }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            transformOrigin: "left",
            transform: `scaleX(${checking ? 1 : elapsedFraction})`,
            transition: checking ? "none" : "transform 1s linear",
            bgcolor: "primary.main",
            opacity: checking ? 0.35 : 0.6,
          }}
        />
      </Box>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
          gap: 1.5,
          px: { xs: 2, md: 3 },
          py: 1.75,
        }}
      >
        <Typography
          sx={{ fontFamily: monoFontFamily, fontSize: "0.75rem", color: "text.disabled" }}
        >
          {checking ? "checking now…" : `retrying in ${String(secondsLeft).padStart(2, "0")}s`}
        </Typography>
        <Button
          onClick={onRetry}
          disabled={checking}
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon sx={{ fontSize: "1rem" }} />}
          sx={{ alignSelf: { xs: "stretch", sm: "auto" } }}
        >
          Retry now
        </Button>
      </Stack>
    </Box>
  );
};

/* -------------------------------------------------------------------- trace */

/**
 * What was actually measured, so the reader can second-guess the diagnosis.
 *
 * On the most common failure the two addresses alone give the game away - the
 * page came from one host and the API is being called on another - and seeing
 * them side by side is often faster than reading the prose above.
 */
const Trace = ({ facts, sx }: { facts: LinkFacts; sx?: React.ComponentProps<typeof Box>["sx"] }) => {
  const probeState = describeProbe(facts);
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "background.default",
        ...sx,
      }}
    >
      <TraceRow label="page" value={facts.pageOrigin} state="loaded" tone="neutral" />
      <TraceRow
        label="api"
        value={facts.apiUrl}
        state={probeState.label}
        tone={probeState.tone}
        hint={probeState.hint}
      />
      <TraceRow
        label="origins"
        value={facts.sameOrigin ? "same origin" : "cross-origin request"}
        state={facts.sameOrigin ? "cors n/a" : "cors applies"}
        tone="neutral"
        hint={
          facts.sameOrigin
            ? "The page and the API are on the same origin, so CORS cannot be the cause."
            : "The page and the API are on different origins, so the service has to allow this one explicitly."
        }
      />
      <TraceRow
        label="browser"
        value={facts.online ? "reports a network connection" : "reports no network connection"}
        state={facts.online ? "online" : "offline"}
        tone={facts.online ? "neutral" : "warn"}
        last
      />
    </Box>
  );
};

type TraceTone = "neutral" | "warn" | "ok";

const TraceRow = ({
  label,
  value,
  state,
  tone,
  hint,
  last,
}: {
  label: string;
  value: string;
  state: string;
  tone: TraceTone;
  hint?: string;
  last?: boolean;
}) => {
  const stateColor = tone === "warn" ? "warning.main" : tone === "ok" ? "success.main" : "text.disabled";
  const row = (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr auto", sm: "72px minmax(0, 1fr) auto" },
        gap: { xs: 0.25, sm: 1.5 },
        alignItems: "baseline",
        px: 1.75,
        py: 1.25,
        borderBottom: last ? "none" : "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography
        sx={{
          fontFamily: monoFontFamily,
          fontSize: "0.6875rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "text.disabled",
          gridColumn: { xs: "1", sm: "auto" },
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontFamily: monoFontFamily,
          fontSize: "0.75rem",
          color: "text.primary",
          overflowWrap: "anywhere",
          gridColumn: { xs: "1 / -1", sm: "auto" },
          order: { xs: 2, sm: 0 },
        }}
      >
        {value}
      </Typography>
      <Typography
        sx={{
          fontFamily: monoFontFamily,
          fontSize: "0.6875rem",
          letterSpacing: "0.04em",
          color: stateColor,
          textAlign: "right",
          whiteSpace: "nowrap",
          gridColumn: { xs: "2", sm: "auto" },
          gridRow: { xs: "1", sm: "auto" },
        }}
      >
        {state}
      </Typography>
    </Box>
  );
  return hint ? (
    <Tooltip title={hint} placement="top">
      {row}
    </Tooltip>
  ) : (
    row
  );
};

const describeProbe = (facts: LinkFacts): { label: string; tone: TraceTone; hint: string } => {
  if (facts.status !== null) {
    return {
      label: `http ${facts.status}`,
      tone: "warn",
      hint: "The service answered with this status, so it is running and reachable.",
    };
  }
  if (facts.reachedService) {
    return {
      label: "unreadable reply",
      tone: "warn",
      hint: "Something answered at this address, but not with anything this app could read.",
    };
  }
  switch (facts.probe) {
    case "pending":
      return { label: "checking…", tone: "neutral", hint: "Testing whether anything answers at this address." };
    case "answered":
      return {
        label: "answered",
        tone: "ok",
        hint: "A request sent without CORS restrictions got a reply, so something is listening here - though not necessarily DF Downloader.",
      };
    case "timeout":
      return {
        label: "timed out",
        tone: "warn",
        hint: "The address accepted the request and never replied, which usually means a firewall is dropping it.",
      };
    case "silent":
      return {
        label: "no answer",
        tone: "warn",
        hint: "A request sent without CORS restrictions failed too, so most likely nothing is listening here.",
      };
    case "skipped":
    default:
      return { label: "no answer", tone: "warn", hint: "Nothing answered at this address." };
  }
};

/* ---------------------------------------------------------------- the fixes */

const Fix = ({ fix }: { fix: DiagnosisFix }) => (
  <Box>
    <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
      {fix.caption}
    </Typography>
    <CopyBlock code={fix.code} />
    {fix.note && (
      <Typography variant="caption" sx={{ display: "block", mt: 0.75, color: "text.disabled" }}>
        {fix.note}
      </Typography>
    )}
  </Box>
);

/**
 * Subordinate to the prose above it, and copyable - most of these are values
 * meant to be pasted into a compose file or a config, and retyping an address
 * by hand is how the problem started.
 */
const CopyBlock = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    // Not available on an insecure non-localhost origin, which this page can
    // very much be - fall back rather than throwing.
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => {});
      return;
    }
    const area = document.createElement("textarea");
    area.value = code;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      done();
    } catch {
      /* nothing sensible left to try */
    }
    document.body.removeChild(area);
  }, [code]);

  return (
    <Box
      sx={{
        position: "relative",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "background.default",
      }}
    >
      <Box
        component="pre"
        sx={{
          m: 0,
          px: 1.75,
          py: 1.5,
          pr: 6,
          fontFamily: monoFontFamily,
          fontSize: "0.75rem",
          lineHeight: 1.7,
          color: "text.primary",
          overflowX: "auto",
        }}
      >
        {code}
      </Box>
      <Tooltip title={copied ? "Copied" : "Copy"} placement="left">
        <IconButton
          onClick={copy}
          size="small"
          aria-label="Copy to clipboard"
          sx={{ position: "absolute", top: 4, right: 4, color: copied ? "primary.main" : "text.disabled" }}
        >
          {copied ? <DoneIcon sx={{ fontSize: "1rem" }} /> : <ContentCopyIcon sx={{ fontSize: "1rem" }} />}
        </IconButton>
      </Tooltip>
    </Box>
  );
};

/* ------------------------------------------------------ the demoted content */

/**
 * Everything that used to sit at the top at full weight. It is all still worth
 * saying - it just isn't worth saying first, and a reader who has been handed
 * the wrong diagnosis needs somewhere to go next.
 */
const OtherThingsToCheck = ({ diagnosis, facts }: { diagnosis: Diagnosis; facts: LinkFacts }) => {
  const [open, setOpen] = useState(false);
  if (diagnosis.kind === "connecting") {
    return null;
  }
  const showAllowOrigin = diagnosis.fixes.every((fix) => !fix.code.startsWith("rest:"));
  return (
    <Box sx={{ mt: 3, borderTop: "1px solid", borderColor: "divider", pt: 2 }}>
      <Button
        onClick={() => setOpen((prev) => !prev)}
        size="small"
        endIcon={
          <ExpandMoreIcon
            sx={{ fontSize: "1.1rem", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}
          />
        }
        sx={{ color: "text.secondary", ml: -1 }}
      >
        Other things to check
      </Button>
      <Collapse in={open}>
        <Stack spacing={2} sx={{ mt: 1.5 }}>
          <Note>
            The browser's own console has the real reason this request failed. It is deliberately hidden from the
            page, but it is printed there in full — and it will say outright whether the response was blocked or
            never arrived.
          </Note>
          {showAllowOrigin && (
            <Box>
              <Note>
                If the UI and the service run separately — a development server, or the UI behind its own web server
                — the service needs to be told to accept that origin. In <Mono>config.yaml</Mono>:
              </Note>
              <Box sx={{ mt: 1 }}>
                <CopyBlock code={`rest:\n  allowOrigin:\n    - ${facts.pageOrigin}`} />
              </Box>
            </Box>
          )}
          <Note>
            Behind a reverse proxy, check that <Mono>/api</Mono> is forwarded to the service as well as the page
            itself, and that the proxy passes the <Mono>Origin</Mono> header through rather than rewriting it.
          </Note>
          <Note>
            Ad blockers and privacy extensions block requests to bare IP addresses and unusual ports often enough to
            be worth ruling out — try the page in a private window with extensions disabled.
          </Note>
          <Note>
            Still stuck? Drop a message on the Discord server, or{" "}
            <Link href={ISSUES_URL} target="_blank" rel="noreferrer" sx={{ color: "primary.main" }}>
              raise a GitHub issue
            </Link>
            . The four lines above the fold are worth including.
          </Note>
        </Stack>
      </Collapse>
    </Box>
  );
};

const Note = ({ children }: { children: React.ReactNode }) => (
  <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: "68ch" }}>
    {children}
  </Typography>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <Box component="span" sx={{ fontFamily: monoFontFamily, fontSize: "0.8125em", color: "text.primary" }}>
    {children}
  </Box>
);
