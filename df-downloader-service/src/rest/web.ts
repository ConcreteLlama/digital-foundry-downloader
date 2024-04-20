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
  const indexHtmlContent = readFileSync(indexHtml, "utf-8");
  const bundleJs = readFileSync(path.join(uiDir, "js", "df-content-manager.js"), "utf-8").replace(
    "_____DF_CONTENT_MANAGER_PLACEHOLDER_API_URL_____",
    `${publicAddress}/api`
  );
  const assetsDir = path.join(uiDir, "assets");
  const staticDir = path.join(uiDir, "static");

  router.use("/assets", express.static(assetsDir));
  router.use("/static", express.static(staticDir));
  router.use("/js/df-content-manager.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.send(bundleJs);
  });
  router.use("*", (req, res) => {
    return res.send(indexHtmlContent);
  });
  return router;
};
