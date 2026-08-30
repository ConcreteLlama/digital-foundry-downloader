import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../df-content-manager.js";
import { makeContentApiRouter } from "./api/content.js";
import { makeDownloadsApiRouter as makeTasksApiRouter } from "./api/tasks.js";
import { makeConfigRouter } from "./api/config.js";
import { makeDfUserInfoRouter } from "./api/df-user-info.js";
import { makeServiceInfoRouter } from "./api/service-info.js";
import { makeAuthRouter } from "./api/auth.js";
import { JwtManager } from "./auth/jwt.js";
import { makePreviewRouter } from "./api/preview.js";
import { authenticateMiddleware } from "./middleware/authentication.js";
import { makeSubtitlesRouter } from "./api/subtitles.js";
import { makeUserRouter } from "./api/user.js";
import { makeRealtimeRouter } from "./api/realtime.js";
import { makeAiAnalysisRouter } from "./api/ai-analysis.js";
import { makeBackfillRouter } from "./api/backfill.js";
import { makeLogsRouter } from "./api/logs.js";
import { makePlaybackRouter } from "./api/playback.js";

export const makeApiRouter = (contentManager: DigitalFoundryContentManager, jwtManager: JwtManager) => {
  const router = express.Router({ mergeParams: true });

  router.use(express.json({
    limit: "50mb",
  }));
  router.use(express.urlencoded({ extended: true }));

  router.use("/content", authenticateMiddleware(jwtManager), makeContentApiRouter(contentManager));
  router.use("/tasks", authenticateMiddleware(jwtManager), makeTasksApiRouter(contentManager));
  router.use("/config", authenticateMiddleware(jwtManager), makeConfigRouter());
  router.use("/df-user", authenticateMiddleware(jwtManager), makeDfUserInfoRouter(contentManager));
  router.use("/user", authenticateMiddleware(jwtManager), makeUserRouter(contentManager));
  router.use("/subtitles", authenticateMiddleware(jwtManager), makeSubtitlesRouter(contentManager));
  router.use("/ai-analysis", authenticateMiddleware(jwtManager), makeAiAnalysisRouter(contentManager));
  router.use("/backfill", authenticateMiddleware(jwtManager), makeBackfillRouter(contentManager));
  router.use("/logs", authenticateMiddleware(jwtManager), makeLogsRouter());
  /*
    Serves the bytes of already-downloaded files for in-app playback.

    The only router here without a blanket authenticateMiddleware, and
    deliberately so: a cast receiver is a separate device with no session
    cookie, so the two routes that serve bytes have to accept a signed URL
    as well. Rather than exempting the whole router, it authenticates per
    route - see rest/api/playback.ts and rest/auth/cast-url-signing.ts.
  */
  router.use("/playback", makePlaybackRouter(contentManager, jwtManager));
  // Single multiplexed SSE stream for every push channel - see
  // realtime/stream-broadcaster.ts. Same auth as everything else; an
  // EventSource request is a plain GET, so the cookie rides along.
  router.use("/stream", authenticateMiddleware(jwtManager), makeRealtimeRouter(contentManager));
  router.use("/service-info", makeServiceInfoRouter());
  router.use("/preview", makePreviewRouter(contentManager));
  router.use("/auth", makeAuthRouter(jwtManager));

  router.get("/status");

  return router;
};
