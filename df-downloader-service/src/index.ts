import * as url from "url";
import path from "path";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
process.chdir(path.join(__dirname, ".."));
import { configService } from "./config/config.js";

import { DigitalFoundryContentManager } from "./df-content-manager.js";
import { logger } from "df-downloader-common";
import { makeRoutes } from "./rest/routes.js";
import { loadServices } from "./services/service-loader.js";
import { JwtManager } from "./rest/auth/jwt.js";
import { serviceLocator } from "./services/service-locator.js";
import { DfFileOperationalDb } from "./db/df-file-operational-db.js";
import { closeAllQueues, forceCloseAllQueues } from "./utils/queue-utils.js";

let closeAttempts = 0;

process
  .on("unhandledRejection", (reason, p) => {
    logger.log("error", reason, "Unhandled promise rejection", p);
  })
  .on("uncaughtException", (err) => {
    logger.log("error", "Uncaught exception", err);
  })
  .on("SIGINT", async () => {
    closeAttempts++;
    if (closeAttempts === 1) {
      logger.log("info", "Caught interrupt signal");
      await closeAllQueues();
      process.exit();
    } else if (closeAttempts === 3) {
      logger.log("error", "Force closing queues");
      await forceCloseAllQueues();
      process.exit();
    } else if (closeAttempts > 10) {
      logger.log("info", "Wow, you really want to close the service, huh?");
      process.exit();
    }
  });

async function start() {
  logger.level = configService.config.logging.logLevel;
  const db = await DfFileOperationalDb.create();
  await db.init();
  serviceLocator.setDb(db);
  const dfContentManager = new DigitalFoundryContentManager(db);
  loadServices();
  if (configService.config.restApi) {
    const jwtManager = await JwtManager.create(86400);
    makeRoutes(dfContentManager, jwtManager);
  }
  await dfContentManager.start();
}
start();
