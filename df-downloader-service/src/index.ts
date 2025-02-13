import * as url from "url";
import path from "path";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
process.chdir(path.join(__dirname, ".."));
import { configService } from "./config/config.js";

import { DfLowDb } from "./db/df-operational-db-lowdb.js";
import { DigitalFoundryContentManager } from "./df-content-manager.js";
import { logger } from "df-downloader-common";
import { makeRoutes } from "./rest/routes.js";
import { loadServices } from "./services/service-loader.js";
import { JwtManager } from "./rest/auth/jwt.js";
import { serviceLocator } from "./services/service-locator.js";

process
  .on("unhandledRejection", (reason, p) => {
    logger.log("error", reason, "Unhandled promise rejection", p);
  })
  .on("uncaughtException", (err) => {
    logger.log("error", "Uncaught exception", err);
  });

async function start() {
  logger.level = configService.config.logging.logLevel;
  const db = await DfLowDb.create();
  const dbInitInfo = await db.init();
  serviceLocator.setDb(db);
  const dfContentManager = new DigitalFoundryContentManager(db);
  loadServices();
  if (configService.config.restApi) {
    const jwtManager = await JwtManager.create(86400);
    makeRoutes(dfContentManager, jwtManager);
  }
  await dfContentManager.start(dbInitInfo);
}
start();
