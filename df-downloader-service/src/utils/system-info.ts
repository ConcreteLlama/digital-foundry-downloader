import { DatabaseInfo, SystemInfo, ToolInfo, logger } from "df-downloader-common";
import { AiAnalysisConfigUtils } from "df-downloader-common/config/ai-analysis-config.js";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { configDir, configService } from "../config/config.js";
import { ensureEnvString } from "./env-utils.js";
import { DfDownloaderOperationalDb } from "../db/df-operational-db.js";
import { getLogFilePath } from "./logging/file-logging.js";
import { BUILT_AT, CURRENT_BRANCH, CURRENT_COMMIT, CURRENT_VERSION } from "../version.js";

const execFileAsync = promisify(execFile);

/**
 * Long enough for a cold binary on a slow disk, short enough that a hung one
 * cannot hold up the page. Every tool here is asked only for its version.
 */
const TOOL_TIMEOUT_MS = 5000;

/**
 * Asks a tool what it is, without letting a broken one break the page.
 *
 * Several of these report their version on stderr, or exit non-zero while
 * still printing it - whisper-cli has no --version at all and has to be
 * identified from its help output - so this takes the first non-empty line of
 * whichever stream produced one and does not treat a failure as fatal.
 */
const probeTool = async (name: string, path: string, args: string[]): Promise<ToolInfo> => {
  try {
    const { stdout, stderr } = await execFileAsync(path, args, { timeout: TOOL_TIMEOUT_MS });
    const firstLine = `${stdout}\n${stderr}`
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return { name, path, available: true, version: firstLine };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // A non-zero exit still means the binary exists and ran, which is the
    // thing worth knowing - only a spawn failure means it is genuinely absent.
    const ranButFailed = !/ENOENT|not found/i.test(message);
    return { name, path, available: ranButFailed, version: message.split("\n")[0] };
  }
};

const resolveToolPaths = () => {
  const config = configService.config;
  return [
    {
      name: "whisper-cli",
      path: config.subtitles?.services?.whisper?.binaryPath || process.env.WHISPER_BINARY || "whisper-cli",
      args: ["--help"],
    },
    {
      name: "llama-server",
      path: config.aiAnalysis?.local?.binaryPath || process.env.LLAMA_SERVER_BINARY || "llama-server",
      args: ["--version"],
    },
  ];
};

/**
 * How much of a stored file to read looking for its header.
 *
 * The version and timestamp are the first two keys written, and the largest
 * of these files runs to megabytes - parsing one to read two fields would be
 * an odd thing to do every time somebody opens a page.
 */
const DB_HEADER_BYTES = 300;

const readDatabaseHeader = async (filePath: string) => {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(DB_HEADER_BYTES), 0, DB_HEADER_BYTES, 0);
    const head = buffer.subarray(0, bytesRead).toString("utf-8");
    return {
      version: head.match(/"version"\s*:\s*"([^"]+)"/)?.[1],
      lastUpdated: head.match(/"lastUpdated"\s*:\s*"([^"]+)"/)?.[1],
    };
  } finally {
    await handle.close();
  }
};

/**
 * Every stored file, by name, size and version.
 *
 * Backups are skipped: they are copies of the same stores, and listing a
 * directory of them says nothing about the state of the live ones.
 */
export const getDatabaseInfo = async (): Promise<DatabaseInfo[]> => {
  const dbDir = ensureEnvString("DB_DIR", "db");
  try {
    const entries = await fs.promises.readdir(dbDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    const described = await Promise.all(
      files.map(async (entry) => {
        const filePath = path.join(dbDir, entry.name);
        const { size } = await fs.promises.stat(filePath);
        let header: { version?: string; lastUpdated?: string } = {};
        try {
          header = await readDatabaseHeader(filePath);
        } catch {
          // A file that cannot be read is still worth listing with its size -
          // that it exists and how big it is may be the whole answer.
        }
        return { name: entry.name, sizeBytes: size, ...header };
      })
    );
    return described.sort((a, b) => b.sizeBytes - a.sizeBytes);
  } catch (e) {
    logger.log("warn", `Could not describe the databases for the system report: ${e}`);
    return [];
  }
};

/**
 * Everything the app can say about itself and the machine under it.
 *
 * Best-effort throughout: a section that cannot be gathered degrades rather
 * than failing the whole call, because the times this matters most are
 * exactly the times something is broken.
 */
export const getSystemInfo = async (db: DfDownloaderOperationalDb): Promise<SystemInfo> => {
  const config = configService.config;
  const cpus = os.cpus();

  const tools = await Promise.all(
    resolveToolPaths().map(({ name, path: toolPath, args }) => probeTool(name, toolPath, args))
  );
  const databases = await getDatabaseInfo();

  let content = { entries: 0, downloaded: 0, analysed: 0, analysesFailed: 0, withArticle: 0, legacy: 0 };
  try {
    const entries = await db.getAllContentEntries();
    /*
     * Counted from the analysis index, not from the content entries.
     *
     * DfContentEntry has an `aiAnalysis` field and nothing populates it -
     * results live in their own store, which is the entire reason that store
     * exists. Counting the field reported zero analyses on an install with
     * thousands, which is worse than reporting nothing: a diagnostic that is
     * confidently wrong sends whoever reads it looking in the wrong place.
     */
    const analysisIndex = db.getAiAnalysisIndex();
    const analyses = Object.values(analysisIndex);
    content = {
      entries: entries.length,
      downloaded: entries.filter((entry) => entry.downloads.length > 0).length,
      analysed: analyses.length,
      // Separated because a failed analysis still occupies the slot: it counts
      // as analysed to everything that decides what to run next, and is the
      // first thing worth knowing when someone says analysis is misbehaving.
      analysesFailed: analyses.filter((entry) => entry.hasError).length,
      withArticle: Object.values(db.getAllDfArticleIndexEntries()).filter((entry) => entry.hasArticle).length,
      legacy: entries.filter((entry) => Boolean(entry.contentInfo.legacy)).length,
    };
  } catch (e) {
    logger.log("warn", `Could not summarise content for the system report: ${e}`);
  }

  return {
    app: {
      version: CURRENT_VERSION,
      branch: CURRENT_BRANCH,
      commit: CURRENT_COMMIT,
      builtAt: BUILT_AT,
      isContainer: (process.env.CONTAINER_ENV?.length || 0) > 0,
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      cpuModel: cpus[0]?.model?.trim() ?? "unknown",
      cpuCount: cpus.length,
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytes: os.freemem(),
      // Windows always reports [0, 0, 0] rather than anything meaningful, so
      // it is omitted there instead of shown as an idle machine.
      loadAverage: process.platform === "win32" ? undefined : os.loadavg(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    paths: {
      configDir,
      workDir: config.contentManagement?.workDir ?? "unknown",
      destinationDir: config.contentManagement?.destinationDir ?? "unknown",
      logFile: getLogFilePath(),
    },
    tools,
    databases,
    content,
    features: {
      signedIntoDf: Boolean(config.digitalFoundry?.sessionId),
      // The order matters as much as the membership - which one gets tried
      // first is the answer to most "why did it use that" questions.
      subtitlesService: config.subtitles?.servicePriorities?.join(" then ") || "none",
      // What would actually answer, which is not always what is configured:
      // a missing API key silently falls back to the local model.
      aiProvider: config.aiAnalysis?.enabled
        ? AiAnalysisConfigUtils.resolveProvider(config.aiAnalysis) ?? "none usable"
        : "off",
      plexEnabled: Boolean(config.mediaServers?.servers?.plex?.enabled),
      jellyfinEnabled: Boolean(config.mediaServers?.servers?.jellyfin?.enabled),
      scheduledBackfillEnabled: Boolean(config.aiAnalysis?.scheduledBackfill?.enabled),
      automaticDownloadsEnabled: Boolean(config.automaticDownloads?.enabled),
    },
  };
};
