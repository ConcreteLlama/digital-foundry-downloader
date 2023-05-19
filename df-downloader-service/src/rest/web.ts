import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { configService } from "../config/config.js";
import { logger } from "df-downloader-common";
import { checkDir } from "../utils/file-utils.js";
import express from "express";

export const makeWebRouter = (publicAddress: string) => {
  const router = express.Router();
  const restConfig = configService.config.restApi;
  const uiDir = path.join("public");
  if (!checkDir(uiDir)) {
    logger.log("warn", `UI Directory ${uiDir} does not exist, no web route to be created`);
    return;
  }
  logger.log("info", `Using UI dir ${uiDir}`);
  const indexHtml = path.join(uiDir, "index.html");
  let indexHtmlContent = readFileSync(indexHtml, "utf-8");
  indexHtmlContent = indexHtmlContent.replace(
    /window\.__API_URL__ ?= ?"[^"]*"/,
    `window.__API_URL__ = "${publicAddress}/api"`
  );
  const assetsDir = path.join(uiDir, "assets");
  const staticDir = path.join(uiDir, "static");

  router.use("/assets", express.static(assetsDir));
  router.use("/static", express.static(staticDir));
  router.use("*", (req, res) => {
    return res.send(indexHtmlContent);
  });
  return router;
};
