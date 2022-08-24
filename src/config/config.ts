import {
  ensureEnvBoolean,
  ensureEnvInteger,
  ensureEnvString,
  ensureEnvStringArray,
  ScoreMap,
} from "../utils/env-utils.js";
import { Logger, LogLevel } from "../logger.js";
import { ensureDirectory } from "../utils/file-utils.js";

const logLevelStr = process.env.LOG_LEVEL || "DEBUG";
const logLevel = LogLevel[<keyof typeof LogLevel>logLevelStr];
const logger = new Logger(logLevel);

logger.log(LogLevel.INFO, `Log level is set to ${logLevelStr}`);

const sessionId = ensureEnvString("DF_SESSION_ID");
const workDir = process.env.WORK_DIR || "work_dir";
ensureDirectory(workDir);
const destinationDir = ensureEnvString("DESTINATION_DIR");
ensureDirectory(destinationDir);
const ignoreOldContentOnFirstRun = ensureEnvBoolean("IGNORE_OLD_CONTENT", true);
const configDir = ensureEnvString("CONFIG_DIR");
ensureDirectory(configDir);
const maxSimultaneousDownloads = ensureEnvInteger("MAX_SIMULTANEOUS_DOWNLOADS");
const downloadDelay = ensureEnvInteger("DOWNLOAD_DELAY", 60000);
const httpPort = ensureEnvInteger("HTTP_PORT", 44556);
const httpEnabled = ensureEnvBoolean("HTTP_ENABLED", true);
const contentCheckInterval = ensureEnvInteger("CONTENT_CHECK_INTERVAL", 60000);
if (contentCheckInterval < 30000) {
  throw new Error("Content check interval is too low - must be at least 30000");
}

const mediaTypeScores = ensureEnvStringArray("MEDIA_TYPE_PRIORITIES", [
  "HEVC",
  "h.264 (4K)",
  "h.264 (1080p)",
  "h.264",
  "MP3",
]);
const mediaTypeScoreMap = new ScoreMap(mediaTypeScores);

export const config = {
  logger,
  sessionId,
  workDir,
  destinationDir,
  ignoreOldContentOnFirstRun,
  configDir,
  maxSimultaneousDownloads,
  downloadDelay,
  httpPort,
  httpEnabled,
  mediaTypeScoreMap,
  failureRetryIntervalBase: 60000,
  maxRetries: 10,
  contentCheckInterval,
};

export type Config = typeof config;
