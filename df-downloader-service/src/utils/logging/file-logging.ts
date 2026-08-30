import { logger } from "df-downloader-common";
import { LOG_FILE_NAME } from "df-downloader-common/config/logging-config.js";
import path from "node:path";
import { configService } from "../../config/config.js";
import { FILE_LOG_SINK_NAME, FileLogSink } from "./file-log-sink.js";

let sink: FileLogSink | null = null;

/**
 * Builds the sink the current config asks for, replacing whatever was there.
 *
 * Rebuilt wholesale rather than mutated because every one of its inputs - the
 * directory, the size cap, how many files to keep - is fixed at construction,
 * and reconfiguring is rare enough that the simplicity is worth more than
 * avoiding one object allocation.
 */
const applyConfig = () => {
  const { file } = configService.config.logging;
  const { workDir } = configService.config.contentManagement;
  // Anything buffered belongs in the file the old configuration pointed at.
  sink?.flush();
  if (!file.enabled) {
    if (sink) {
      logger.removeSink(FILE_LOG_SINK_NAME);
      sink = null;
      logger.log("info", "File logging disabled");
    }
    return;
  }
  sink = new FileLogSink(file.logLevel, workDir, LOG_FILE_NAME, file.maxFileSizeMb * 1024 * 1024, file.maxFiles);
  logger.addSink(sink);
  logger.log(
    "info",
    `File logging to ${sink.filePath} at level "${file.logLevel}" (max ${file.maxFileSizeMb}MB x ${file.maxFiles} files)`
  );
};

/**
 * Starts file logging and keeps it in step with config.
 *
 * Called as early as possible in startup so that as little as possible happens
 * before there is somewhere for it to be recorded.
 */
export const initFileLogging = () => {
  applyConfig();
  configService.on("configUpdated:logging", ({ newValue }) => {
    // The console level is applied here too, so changing it takes effect on
    // save rather than at the next restart.
    logger.level = newValue.logLevel;
    applyConfig();
  });
  // The log lives in the work dir, so moving the work dir moves the log.
  configService.on("configUpdated:contentManagement", ({ newValue, oldValue }) => {
    if (newValue.workDir !== oldValue.workDir) {
      applyConfig();
    }
  });
  // Whatever is buffered when the process goes down still gets written -
  // losing the last quarter second of log is exactly the case where you most
  // want to see it. 'exit' only permits synchronous work, which is why the
  // flush is synchronous.
  process.on("exit", () => sink?.flush());
};

/**
 * The paths the log would live at for the current config, whether or not file
 * logging is currently switched on.
 *
 * Derived rather than taken from the sink so that turning file logging off
 * doesn't also hide the log it already wrote - the file is still on disk, and
 * being able to read back what happened before you disabled it is the whole
 * reason it was written.
 */
const derivePaths = () => {
  const base = path.join(configService.config.contentManagement.workDir, LOG_FILE_NAME);
  const paths = [base];
  for (let i = 1; i < configService.config.logging.file.maxFiles; i++) {
    paths.push(`${base}.${i}`);
  }
  return paths;
};

/** The log files to read, current first then rotated newest to oldest. */
export const getLogFilePaths = () => sink?.allFilePaths ?? derivePaths();

export const getLogFilePath = () => sink?.filePath ?? derivePaths()[0];

export const isFileLoggingEnabled = () => sink !== null;

/**
 * Pushes buffered entries to disk so a reader sees them.
 *
 * Without this the Logs page would consistently trail by up to one flush
 * interval, which reads as the log having stalled right when you are watching
 * something happen.
 */
export const flushFileLog = () => sink?.flush();
