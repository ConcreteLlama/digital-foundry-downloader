import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { configService } from "../config/config.js";
import { LogLevel, logger } from "../utils/logger.js";
import { checkDir } from "../utils/file-utils.js";
import express from "express";

export const makeWebRouter = () => {
  const router = express.Router();
  const restConfig = configService.config.restApi;
  let publicAddress = process.env.PUBLIC_ADDRESS;
  if (publicAddress) {
    logger.log(LogLevel.INFO, `Using public address ${publicAddress} from .env`);
  } else if (restConfig.publicAddress) {
    publicAddress = restConfig.publicAddress;
    logger.log(LogLevel.INFO, `Using public address ${publicAddress} from config`);
  } else {
    const protcol = restConfig.https ? "https" : "http";
    const port = restConfig.http ? restConfig.http.port : restConfig.https!.port;
    publicAddress = `${protcol}://127.0.0.1:${port}`;
    logger.log(LogLevel.INFO, `Using auto generated public address ${publicAddress}`);
  }
  const uiDir = path.join("public");
  if (!checkDir(uiDir)) {
    logger.log(LogLevel.WARN, `UI Directory ${uiDir} does not exist, no web route to be created`);
    return;
  }
  logger.log(LogLevel.INFO, `Using UI dir ${uiDir}`);
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
