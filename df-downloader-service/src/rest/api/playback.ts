import cors from "cors";
import {
  CastPlaybackUrls,
  CastSubtitleTrack,
  Chapter,
  DfContentInfoUtils,
  PlaybackInfo,
  PlaybackSubtitleTrack,
  PlaybackVideoCodec,
  logger,
} from "df-downloader-common";
import express, { NextFunction, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { srtToVtt } from "../../media-utils/subtitles/vtt-utils.js";
import { sanitizeContentName } from "../../utils/df-utils.js";
import { extractBaseMetadata } from "../../utils/media-metadata.js";
import { ServiceContentUtils } from "../../utils/service-content-utils.js";
import {
  CAST_EXPIRES_PARAM,
  CAST_SIGNATURE_PARAM,
  CAST_URL_LIFETIME_MS,
  signCastUrl,
  verifyCastUrl,
} from "../auth/cast-url-signing.js";
import { JwtManager } from "../auth/jwt.js";
import { authenticateMiddleware } from "../middleware/authentication.js";
import { AuthenticatedRequest, sendAuthErrorResponse } from "../utils/auth.js";
import { getLanReachableAddress, sendError, sendResponse } from "../utils/utils.js";

/**
 * In-app playback of files this app has already downloaded.
 *
 * Three things here are load-bearing rather than polish, each confirmed by
 * measurement against real downloads rather than assumed:
 *
 * 1. Range support is what makes playback possible at all, not merely what
 *    makes seeking fast. The files this app produces carry their `moov`
 *    atom AFTER `mdat` (ffmpeg's default; they are not "faststart" files),
 *    so a browser must read the tail of the file before it can decode a
 *    single frame. Measured on a 2.2GB download: with Range honoured, 16ms
 *    to `loadedmetadata`; with the server ignoring Range and always
 *    answering 200, 4.4 SECONDS and the whole 2.2GB read off disk just to
 *    show one frame. On a 4.5GB DF Direct over a LAN that is the difference
 *    between working and not.
 *
 * 2. The file is resolved from the DB record, never from the request. The
 *    `downloadLocation` query parameter is a lookup KEY matched against the
 *    entry's own downloads (pathIsEqual), and what actually gets opened is
 *    the path the DB holds. A path that does not match a download of that
 *    entry is a 404, so this cannot be walked around the destination
 *    directory - which is also why express.static is not used here.
 *
 * 3. Auth is decided per route here rather than by a blanket middleware in
 *    rest/api.ts, which is what casting forced. Ordinary browser playback
 *    still rides on the session cookie - a `<video src>` is a plain GET, so
 *    the cookie goes along on its own, including on the range requests the
 *    browser issues itself. But a cast receiver is a separate device with
 *    no cookie and no way to get one, so the two routes that serve bytes
 *    (`stream`, `subtitles`) additionally accept a signed URL, and `info`
 *    deliberately does not: a receiver never calls it, and the exemption is
 *    kept to exactly the routes that cannot work without it. See
 *    auth/cast-url-signing.ts.
 *
 * A note for whoever picks up the AI-analysis timestamp linkage (roadmap
 * item 10's speculative follow-up): chapters are ALREADY available
 * client-side by the time playback starts - PlaybackInfo.chapters is
 * `{title, start, end}` in milliseconds, read out of the file itself, and
 * the player seeks by setting `video.currentTime = ms / 1000`. Anchoring an
 * analysis row to a chapter therefore needs no new plumbing on this side;
 * it needs the analysis to carry a chapter reference. Nothing here assumes
 * chapters are only ever used to draw the chapter list.
 */

/** What the browser is handed as the `<video>` source type. */
const mimeTypeForFile = (filePath: string): string => {
  switch (path.extname(filePath).toLowerCase()) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".webm":
      return "video/webm";
    case ".mkv":
      // Browsers do not play matroska, but saying so honestly lets the UI
      // fall back to open-externally rather than show a dead player.
      return "video/x-matroska";
    default:
      return "video/mp4";
  }
};

/**
 * A representative RFC 6381 type string for the UI's canPlayType() check.
 *
 * Deliberately representative rather than derived exactly from the file's
 * own profile and level. Browser support for these codecs is a
 * platform-level all-or-nothing matter - either the OS/browser ships a
 * decoder for the family or it does not - so a per-file exact string buys
 * no accuracy while adding a fiddly, easy-to-get-wrong construction
 * (particularly for HEVC, whose codec string encodes profile space,
 * compatibility flags, tier and six constraint bytes).
 *
 * The string must still be SPECIFIC, which is the part that is easy to get
 * wrong in the other direction: a bare `codecs="hvc1"` is reported as
 * unsupported by a browser that decodes `hvc1.1.6.L93.B0` perfectly well,
 * so an under-specified probe reads as "cannot play" and would send every
 * HEVC download down the open-externally path for no reason.
 */
const codecProbeFor = (codec: PlaybackVideoCodec, mimeType: string): string | undefined => {
  switch (codec) {
    case "h264":
      return `${mimeType}; codecs="avc1.640028"`;
    case "hevc":
      return `${mimeType}; codecs="hvc1.1.6.L93.B0"`;
    default:
      return undefined;
  }
};

const videoCodecFromProbe = (codecName?: string): PlaybackVideoCodec => {
  switch (codecName) {
    case "h264":
      return "h264";
    case "hevc":
    case "h265":
      return "hevc";
    default:
      return "other";
  }
};

export const makePlaybackRouter = (contentManager: DigitalFoundryContentManager, jwtManager: JwtManager) => {
  const router = express.Router();

  /*
    Establishes who the caller is without rejecting anyone.

    `noReject` is the point: every route below decides for itself what it
    will accept, so this only populates `req.user` when there is a valid
    session. A route that needs one says so; the two that also take a signed
    URL check that instead.
  */
  router.use(authenticateMiddleware(jwtManager, { noReject: true }));

  /*
    Cross-origin access, opened only for requests carrying a signed URL.

    Cast fetches sideloaded subtitle tracks with CORS enforced, and the app's
    own allowlist covers its own origins rather than a receiver's. Rather
    than relaxing CORS globally, this applies only when the request presents
    a token - which is already a capability for exactly one file, so allowing
    any origin to use one grants nothing the holder did not already have.
    Requests without a token fall through to the global policy untouched.
  */
  const castCors = cors({
    origin: true,
    methods: ["GET", "HEAD", "OPTIONS"],
    allowedHeaders: ["Range", "Content-Type", "Accept-Encoding"],
    exposedHeaders: ["Content-Length", "Content-Range", "Accept-Ranges", "Content-Type"],
  });
  const castCorsIfSigned = (req: Request, res: Response, next: NextFunction) =>
    typeof req.query[CAST_SIGNATURE_PARAM] === "string" ? castCors(req, res, next) : next();

  /**
   * Resolves a request to a real file on disk, or explains why it cannot.
   *
   * The only place a request turns into a path, deliberately - see point 2
   * in the file comment.
   */
  const resolveDownload = async (req: Request) => {
    const contentKey = sanitizeContentName(req.params.contentKey);
    const downloadLocation = typeof req.query.downloadLocation === "string" ? req.query.downloadLocation : undefined;
    if (!downloadLocation) {
      return { ok: false, error: "Must supply downloadLocation", code: 400 } as const;
    }
    const entry = await contentManager.db.getContentEntry(contentKey);
    if (!entry) {
      return { ok: false, error: "Content not found", code: 404 } as const;
    }
    const download = ServiceContentUtils.getDownloadByLocation(entry, downloadLocation);
    if (!download) {
      return { ok: false, error: "No such download for this content", code: 404 } as const;
    }
    // The DB's path, not the caller's.
    const filePath = download.downloadLocation;
    const stat = await fs.promises.stat(filePath).catch(() => undefined);
    if (!stat?.isFile()) {
      // The file has been moved or deleted behind the DB's back - a real
      // possibility given Tools > Reorganize Files and manual tidying.
      return { ok: false, error: "File is no longer on disk", code: 404 } as const;
    }
    return { ok: true, contentKey, entry, download, filePath, stat } as const;
  };

  /**
   * Resolves the file and establishes that the caller may have its bytes.
   *
   * The signature is checked **after** resolution, against the path the DB
   * returned rather than the one the caller asked for. That ordering is the
   * whole point: the signature only proves we minted this URL, while the DB
   * lookup is what proves the path is a real download of that content. A
   * valid signature is never a substitute for that check, so a signed URL
   * cannot be pointed at a file this content does not own.
   *
   * Requests with neither a session nor a signature are turned away before
   * any of that, so an unauthenticated caller cannot make us do database and
   * filesystem work just by asking.
   */
  const resolveForBytes = async (req: AuthenticatedRequest, res: Response) => {
    const hasSignature =
      typeof req.query[CAST_SIGNATURE_PARAM] === "string" && typeof req.query[CAST_EXPIRES_PARAM] === "string";
    if (!req.user && !hasSignature) {
      sendAuthErrorResponse(res, req.authorizationError === "token-expired" ? "token-expired" : "no-token");
      return undefined;
    }
    const resolved = await resolveDownload(req);
    if (!resolved.ok) {
      sendError(res, resolved.error, resolved.code);
      return undefined;
    }
    if (
      !req.user &&
      !verifyCastUrl(
        jwtManager.signingSecret,
        resolved.contentKey,
        resolved.download.downloadLocation,
        req.query[CAST_EXPIRES_PARAM],
        req.query[CAST_SIGNATURE_PARAM]
      )
    ) {
      // Covers a forged signature, one for a different file, and an expired
      // one - none of which are worth telling the caller apart.
      sendAuthErrorResponse(res, "invalid-token");
      return undefined;
    }
    return resolved;
  };

  // Session only, deliberately. A receiver never calls this, so it has no
  // reason to be reachable with a signed URL.
  router.get("/:contentKey/info", async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return sendAuthErrorResponse(res, req.authorizationError === "token-expired" ? "token-expired" : "no-token");
    }
    const resolved = await resolveDownload(req);
    if (!resolved.ok) {
      return sendError(res, resolved.error, resolved.code);
    }
    const { contentKey, download, filePath, stat } = resolved;
    // One ffprobe for chapters, codec and duration together - see
    // ProbedVideoStream. Chapters are read back at request time on purpose:
    // they are embedded into the file at download time and never persisted,
    // so the file is the only source of truth for them.
    const meta = await extractBaseMetadata(filePath, true).catch((e) => {
      logger.log("warn", `Playback probe failed for ${filePath}: ${e}`);
      return undefined;
    });
    const mimeType = mimeTypeForFile(filePath);
    const videoCodec = videoCodecFromProbe(meta?.videoStream?.codecName);
    // Only sidecars can be served; an embedded track is not reachable by a
    // browser at all (see PlaybackSubtitleTrack).
    const allSubtitles = download.subtitles ?? [];
    const subtitleTracks: PlaybackSubtitleTrack[] = allSubtitles.flatMap((subtitle, index) =>
      subtitle.path
        ? [
            {
              index,
              language: subtitle.language,
              label: subtitle.language.toLowerCase().startsWith("en") ? "English" : subtitle.language,
            },
          ]
        : []
    );
    const info: PlaybackInfo = {
      contentKey,
      downloadLocation: download.downloadLocation,
      mimeType,
      videoCodec,
      codecProbe: codecProbeFor(videoCodec, mimeType),
      sizeBytes: stat.size,
      durationSeconds: meta?.durationSeconds,
      width: meta?.videoStream?.width,
      height: meta?.videoStream?.height,
      chapters: (meta?.chapters ?? []) as Chapter[],
      subtitleTracks,
      embeddedSubtitlesOnly: subtitleTracks.length === 0 && allSubtitles.length > 0,
    };
    return sendResponse(res, info);
  });

  /**
   * The subtitle sidecar, converted to WebVTT on the way out.
   *
   * Addressed by index into the download's own subtitles array rather than
   * by path, so the client never names a file. Small enough (tens of KB)
   * that converting per request is not worth caching.
   */
  router.get("/:contentKey/subtitles/:trackIndex", castCorsIfSigned, async (req: AuthenticatedRequest, res: Response) => {
    const resolved = await resolveForBytes(req, res);
    if (!resolved) {
      return;
    }
    const { download } = resolved;
    const trackIndex = Number.parseInt(req.params.trackIndex, 10);
    const subtitle = download.subtitles?.[trackIndex];
    if (!subtitle?.path) {
      return sendError(res, "No such subtitle track", 404);
    }
    const srt = await fs.promises.readFile(subtitle.path, "utf8").catch(() => undefined);
    if (srt === undefined) {
      return sendError(res, "Subtitle file is no longer on disk", 404);
    }
    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    // The .srt can be regenerated in place, so this must not be cached across
    // a subtitle regeneration.
    res.setHeader("Cache-Control", "no-cache");
    return res.send(srtToVtt(srt));
  });

  /**
   * The media bytes themselves, with Range support.
   *
   * See point 1 in the file comment for why Range is mandatory here.
   */
  router.get("/:contentKey/stream", castCorsIfSigned, async (req: AuthenticatedRequest, res: Response) => {
    const resolved = await resolveForBytes(req, res);
    if (!resolved) {
      return;
    }
    const { filePath, stat } = resolved;
    const size = stat.size;
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", mimeTypeForFile(filePath));

    const openStream = (start: number, end: number) => {
      const stream = fs.createReadStream(filePath, { start, end });
      // Chrome asks for open-ended ranges ("bytes=1234-") and then aborts the
      // response once it has buffered enough, repeatedly, as it plays and
      // seeks. Without this the read stream keeps pulling from disk into a
      // socket nobody is reading: measured at 6.2GB read off disk to serve a
      // 2.2GB file through a single playback session.
      res.on("close", () => stream.destroy());
      stream.on("error", (e) => {
        logger.log("warn", `Error streaming ${filePath}: ${e}`);
        res.destroy();
      });
      stream.pipe(res);
    };

    const rangeHeader = req.headers.range;
    if (!rangeHeader) {
      res.writeHead(200, { "Content-Length": size });
      return openStream(0, size - 1);
    }
    // Only single ranges are handled. Multipart ranges are legal but no
    // browser asks for them for media playback, and answering with the first
    // range is a valid response to such a request anyway.
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match || (!match[1] && !match[2])) {
      return res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
    }
    let start: number;
    let end: number;
    if (!match[1]) {
      // A suffix range ("bytes=-5000") asks for the last N bytes - which is
      // exactly how a browser goes and fetches the trailing moov atom.
      const suffixLength = Number.parseInt(match[2], 10);
      start = Math.max(0, size - suffixLength);
      end = size - 1;
    } else {
      start = Number.parseInt(match[1], 10);
      end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
    }
    if (!Number.isFinite(start) || start >= size || start < 0) {
      return res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
    }
    if (!Number.isFinite(end) || end >= size) {
      end = size - 1;
    }
    if (end < start) {
      return res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
    }
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": end - start + 1,
    });
    return openStream(start, end);
  });

  /**
   * Mints the signed URLs a cast receiver needs, on explicit request.
   *
   * A POST because it creates a credential rather than reading something.
   * Nothing pre-generates these and no page embeds one: a URL good for hours
   * is exactly the kind of thing that should not exist because a panel
   * happened to render, so it is produced only when someone presses Cast.
   *
   * The address is resolved server-side. The browser sending this request
   * may well be reaching us on localhost, which means something entirely
   * different to a receiver across the room.
   */
  router.post("/:contentKey/cast-url", async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return sendAuthErrorResponse(res, req.authorizationError === "token-expired" ? "token-expired" : "no-token");
    }
    const resolved = await resolveDownload(req);
    if (!resolved.ok) {
      return sendError(res, resolved.error, resolved.code);
    }
    const { contentKey, entry, download, filePath } = resolved;

    const baseAddress = getLanReachableAddress();
    if (!baseAddress) {
      // Better to say this plainly than to hand over a localhost URL that
      // the receiver will fail to fetch with nothing to explain why.
      return sendError(
        res,
        "No network address this server can be reached at was found. Set a public address under Settings > REST API so a cast device knows where to fetch from.",
        409
      );
    }

    const meta = await extractBaseMetadata(filePath, false).catch((e) => {
      logger.log("warn", `Cast probe failed for ${filePath}: ${e}`);
      return undefined;
    });
    const mimeType = mimeTypeForFile(filePath);
    const expiresAt = Date.now() + CAST_URL_LIFETIME_MS;
    const { signature } = signCastUrl(jwtManager.signingSecret, contentKey, download.downloadLocation, expiresAt);
    const signedQuery = () => {
      const params = new URLSearchParams();
      params.set("downloadLocation", download.downloadLocation);
      params.set(CAST_EXPIRES_PARAM, String(expiresAt));
      params.set(CAST_SIGNATURE_PARAM, signature);
      return params.toString();
    };
    const routeBase = `${baseAddress}/api/playback/${encodeURIComponent(contentKey)}`;

    const subtitleTracks: CastSubtitleTrack[] = (download.subtitles ?? []).flatMap((subtitle, index) =>
      subtitle.path
        ? [
            {
              index,
              language: subtitle.language,
              label: subtitle.language.toLowerCase().startsWith("en") ? "English" : subtitle.language,
              url: `${routeBase}/subtitles/${index}?${signedQuery()}`,
            },
          ]
        : []
    );

    const castUrls: CastPlaybackUrls = {
      contentKey,
      title: entry.contentInfo.title,
      streamUrl: `${routeBase}/stream?${signedQuery()}`,
      mimeType,
      videoCodec: videoCodecFromProbe(meta?.videoStream?.codecName),
      durationSeconds: meta?.durationSeconds,
      // DF's own CDN, which the receiver can fetch directly - it is not
      // behind this app's auth and needs no signing.
      thumbnailUrl: DfContentInfoUtils.getThumbnailUrl(entry.contentInfo, 1280, 720) || undefined,
      subtitleTracks,
      expiresAt,
    };
    logger.log("info", `Minted a cast URL for ${contentKey}, valid until ${new Date(expiresAt).toISOString()}`);
    return sendResponse(res, castUrls);
  });

  return router;
};
