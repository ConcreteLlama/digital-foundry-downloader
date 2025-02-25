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
  router.use("/service-info", makeServiceInfoRouter());
  router.use("/preview", makePreviewRouter(contentManager));
  router.use("/auth", makeAuthRouter(jwtManager));

  router.get("/status");

  return router;
};
