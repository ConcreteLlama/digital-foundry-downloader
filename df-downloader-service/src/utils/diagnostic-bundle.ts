// The class rather than the usual archiver("zip") call: this version of the
// package exports no default at all, only the format classes, which is what
// both the runtime and the types actually offer.
import { ZipArchive } from "archiver";
import { logger } from "df-downloader-common";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config.js";
import { REDACTED, redactSecrets } from "df-downloader-common/config/secrets.js";
import fs from "fs";
import path from "path";
import { Writable } from "stream";
import YAML from "yaml";
import { configDir, configService } from "../config/config.js";
import { DfDownloaderOperationalDb } from "../db/df-operational-db.js";
import { ensureEnvString } from "./env-utils.js";
import { getLogFilePaths } from "./logging/file-logging.js";
import { getSystemInfo } from "./system-info.js";

/**
 * The parts of a bundle, each independently selectable.
 *
 * The first three are either derived (counts, versions, sizes) or redacted,
 * and are on by default. `databases` is the exception and is off: the stores
 * hold download paths, the full text of every article found, and what you
 * have watched. None of that is redactable in any meaningful sense - it is
 * the content, not a credential sitting beside it - so the only honest
 * protection is to say plainly what it is and let someone choose.
 */
export const DIAGNOSTIC_PARTS = ["system", "config", "logs", "databases"] as const;
export type DiagnosticPart = (typeof DIAGNOSTIC_PARTS)[number];

/**
 * What a request that names no parts gets.
 *
 * Explicitly not "all of them". The databases part has to be asked for by
 * name, or omitting a parameter would quietly hand over the very thing that
 * is off by default in the interface.
 */
export const DEFAULT_DIAGNOSTIC_PARTS: DiagnosticPart[] = ["system", "config", "logs"];

const README = (parts: DiagnosticPart[]) =>
  [
    "DF Downloader diagnostic report",
    "",
    `Created ${new Date().toISOString()}`,
    `Includes: ${parts.join(", ")}`,
    "",
    "What is in here",
    "---------------",
    "system-info.json   What this install is and what it is running on: version,",
    "                   commit, hardware, which tools were found, library counts.",
    "config.yaml        Your configuration, with every credential replaced by",
    `                   "${REDACTED}".`,
    "logs/              The service log files as written, newest first.",
    "databases/        The stored data itself, when it was asked for. Not",
    "                  redacted and not summarised - see below.",
    "",
    "About the redaction",
    "-------------------",
    "Credentials are declared on the configuration schema itself, and both the",
    "settings screen and this report read that same declaration - so a field",
    "that is hidden on screen is hidden here too. A field whose name looks like",
    "a credential is replaced whether or not it was declared, as a backstop.",
    "",
    "A redacted field is replaced rather than removed, so you can still see",
    "that it was set. Check before sharing anyway: the log is not redacted,",
    "because nothing should ever write a credential to it - if something has,",
    "that is a bug worth reporting on its own.",
    "",
    "If a databases folder is present",
    "--------------------------------",
    "It was asked for explicitly - it is not included by default. It holds the",
    "real stored data: where every file was saved, the full text of every",
    "article found, every analysis, and what you have watched and how far. None",
    "of that can be redacted, because it is the content rather than a secret",
    "sitting next to it. Send it to someone you would be comfortable handing a",
    "copy of your library to, and not to a public issue.",
    "",
  ].join("\n");

export type BundleResult = { fileName: string; warnings: string[] };

/**
 * Writes a diagnostic zip to a stream.
 *
 * Streams rather than building in memory: the logs alone can be tens of
 * megabytes, and this runs on machines chosen for being small.
 *
 * Best-effort per part. A section that cannot be read adds a note to the
 * bundle and carries on, because a report that fails to generate when
 * something is broken is a report that fails exactly when it is needed.
 */
export const writeDiagnosticBundle = async (
  destination: Writable,
  parts: DiagnosticPart[],
  db: DfDownloaderOperationalDb
): Promise<BundleResult> => {
  const warnings: string[] = [];
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.pipe(destination);

  archive.append(README(parts), { name: "README.txt" });

  if (parts.includes("system")) {
    try {
      archive.append(JSON.stringify(await getSystemInfo(db), null, 2), { name: "system-info.json" });
    } catch (e) {
      warnings.push(`System information could not be gathered: ${e}`);
    }
  }

  if (parts.includes("config")) {
    try {
      /*
       * Redacted from the live config object rather than by filtering the
       * file's text. The object is what the schema describes, so every
       * credential is found by the same declaration the settings screen uses
       * - whereas text filtering would have to guess at YAML structure and
       * would miss anything shaped unexpectedly.
       */
      const redacted = redactSecrets(configService.config, DfDownloaderConfig);
      archive.append(YAML.stringify(redacted), { name: "config.yaml" });
    } catch (e) {
      warnings.push(`Configuration could not be included: ${e}`);
    }
  }

  if (parts.includes("logs")) {
    const logPaths = getLogFilePaths();
    let included = 0;
    for (const logPath of logPaths) {
      try {
        if (fs.existsSync(logPath)) {
          archive.file(logPath, { name: path.join("logs", path.basename(logPath)) });
          included++;
        }
      } catch (e) {
        warnings.push(`Log file ${logPath} could not be read: ${e}`);
      }
    }
    if (!included) {
      warnings.push("No log files were found - file logging may be turned off.");
    }
  }

  if (parts.includes("databases")) {
    /*
     * The live stores only. Backup directories are skipped - they are copies
     * of the same files, would multiply the size of the bundle, and say
     * nothing about the state of what is actually being used.
     */
    const dbDir = ensureEnvString("DB_DIR", "db");
    try {
      archive.directory(dbDir, "databases", (entry) =>
        /(^|[\/])(backups|manual-backup-)/.test(entry.name) ? false : entry
      );
    } catch (e) {
      warnings.push(`Databases could not be included: ${e}`);
    }
  }

  if (warnings.length) {
    archive.append(warnings.join("\n"), { name: "warnings.txt" });
  }

  await archive.finalize();
  logger.log("info", `Diagnostic report created (${parts.join(", ")})`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return { fileName: `df-downloader-report-${stamp}.zip`, warnings };
};

/** Where config.yaml lives, for the report to name in its own README. */
export const configFilePath = path.join(configDir, "config.yaml");
