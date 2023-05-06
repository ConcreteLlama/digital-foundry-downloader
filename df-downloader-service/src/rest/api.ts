import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../df-content-manager.js";
import { makeContentApiRouter } from "./api/content.js";
import { makeDownloadsApiRouter } from "./api/downloads.js";
import { makeConfigRouter } from "./api/config.js";
import { makeUserRouter } from "./api/user.js";
import { makeServiceInfoRouter } from "./api/service-info.js";

export const makeApiRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router({ mergeParams: true });

  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  router.use("/content", makeContentApiRouter(contentManager));
  router.use("/downloads", makeDownloadsApiRouter(contentManager));
  router.use("/config", makeConfigRouter());
  router.use("/user", makeUserRouter(contentManager));
  router.use("/service-info", makeServiceInfoRouter());

  router.get("/status");

  return router;
};
