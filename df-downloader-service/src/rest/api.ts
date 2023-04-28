import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../df-content-manager.js";
import { makeContentApiRouter } from "./content.js";
import { makeDownloadsApiRouter } from "./downloads.js";
import { makeConfigRouter } from "./config.js";
import { makeUserRouter } from "./user.js";

export const makeApiRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router({ mergeParams: true });

  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  router.use("/content", makeContentApiRouter(contentManager));
  router.use("/downloads", makeDownloadsApiRouter(contentManager));
  router.use("/config", makeConfigRouter());
  router.use("/user", makeUserRouter(contentManager));

  router.get("/status");

  return router;
};
