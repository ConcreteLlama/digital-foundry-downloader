import express from "express";
import cors from "cors";
import { DigitalFoundryContentManager } from "../df-content-manager.js";
import { makeApiRouter } from "./api.js";
import { configService } from "../config/config.js";
import { createExpressServer } from "../utils/http.js";
import path from "node:path";
import { LogLevel, logger } from "../utils/logger.js";
import { rest } from "lodash";
import { ensureDirectory } from "../utils/file-utils.js";
import { checkDir } from "../utils/file-utils.js";
import { writeFile } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";

export function makeRoutes(contentManager: DigitalFoundryContentManager) {
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
  if (checkDir(uiDir)) {
    logger.log(LogLevel.INFO, `Using UI dir ${uiDir}`);
    const indexHtml = path.join(uiDir, "index.html");
    const indexHtmlContent = readFileSync(indexHtml, "utf-8");
    const indexHtmlContentUpdated = indexHtmlContent.replace(
      /window\.__API_URL__ ?= ?"[^"]*"/,
      `window.__API_URL__ = "${publicAddress}/api"`
    );
    writeFileSync(indexHtml, indexHtmlContentUpdated);
  }
  const app = createExpressServer(restConfig);
  app.use(express.static(uiDir));
  app.use(
    cors({
      origin: "*",
    })
  );

  app.use("/api", makeApiRouter(contentManager));
}
