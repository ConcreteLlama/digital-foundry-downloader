import * as url from "url";
import path from "path";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
process.chdir(path.join(__dirname, ".."));
import { configService } from "./config/config.js";

import { DigitalFoundryContentManager } from "./df-content-manager.js";
import { logger } from "df-downloader-common";
import { serviceInfo } from "./utils/service.js";
import { makeRoutes } from "./rest/routes.js";
import { loadServices } from "./services/service-loader.js";
import { JwtManager } from "./rest/auth/jwt.js";
import { serviceLocator } from "./services/service-locator.js";
import { DfFileOperationalDb } from "./db/df-file-operational-db.js";
import { closeAllQueues, forceCloseAllQueues } from "./utils/queue-utils.js";
import { ActivePipelineDb, CompletedPipelineDb } from "./db/file-dbs/pipeline-db.js";
import { ensureEnvString } from "./utils/env-utils.js";
import { initFileLogging } from "./utils/logging/file-logging.js";

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
  // Before anything else that might have something to say, so startup itself
  // is captured rather than being the one part that never reaches the file.
  initFileLogging();
  logger.log("info", `Starting DF Downloader ${serviceInfo.version} (${serviceInfo.branch})`);
  const db = await DfFileOperationalDb.create();
  await db.init();
  serviceLocator.setDb(db);
  // Kept separate from the content DBs: these track work in flight rather
  // than what's been downloaded, and are written on a completely different
  // cadence (see db/file-dbs/pipeline-db.ts).
  const dbDir = ensureEnvString("DB_DIR", "db");
  serviceLocator.setPipelineDbs(await ActivePipelineDb.create(dbDir), await CompletedPipelineDb.create(dbDir));
  const dfContentManager = new DigitalFoundryContentManager(db);
  loadServices();
  if (configService.config.restApi) {
    const jwtManager = await JwtManager.create(86400);
    makeRoutes(dfContentManager, jwtManager);
  }
  await dfContentManager.start();
}
start();
