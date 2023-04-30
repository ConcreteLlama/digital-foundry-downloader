import * as url from "url";
import path from "path";
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
process.chdir(path.join(__dirname, ".."));
import { configService } from "./config/config.js";

import { DfLowDb } from "./db/df-operational-db-lowdb.js";
import { DigitalFoundryContentManager } from "./df-content-manager.js";
import { LogLevel, logger } from "./utils/logger.js";
import { makeRoutes } from "./rest/routes.js";
import { loadServices } from "./services/service-loader.js";

process
  .on("unhandledRejection", (reason, p) => {
    logger.log(LogLevel.ERROR, reason, "Unhandled promise rejection", p);
  })
  .on("uncaughtException", (err) => {
    logger.log(LogLevel.ERROR, "Uncaught exception", err);
  });

async function start() {
  const db = await DfLowDb.create();
  const dbInitInfo = await db.init();
  const dfContentManager = new DigitalFoundryContentManager(db);
  loadServices();
  if (configService.config.restApi) {
    makeRoutes(dfContentManager);
  }
  await dfContentManager.start(dbInitInfo);
}
start();
