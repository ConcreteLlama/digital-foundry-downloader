import { logger } from "df-downloader-common";
import { AiLocalModels, AiLocalProviderConfig } from "df-downloader-common/config/ai-analysis-config.js";
import { ChildProcess, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { configDir } from "../../config/config.js";
import { fileExists } from "../file-utils.js";

/**
 * Running the analysis model here, rather than requiring one elsewhere.
 *
 * Two ways to get a server, and both are legitimate:
 *
 * - `serverUrl` points at one somebody else is running - on this machine or
 *   another entirely, which is how you put the model on a box with a GPU while
 *   the app runs on a NAS.
 * - Otherwise this starts one, so everything needed is inside the container.
 *
 * The model is downloaded on first use rather than shipped, exactly as Whisper
 * models are: several gigabytes has no business in an image, and the "fetched
 * once, kept afterwards" behaviour is already familiar from subtitles.
 */

/**
 * Alongside the Whisper models rather than in the work directory, for the same
 * reason: the work directory is scratch space, and putting multi-gigabyte
 * downloads there would re-fetch them every time the container was recreated.
 */
const resolveModelDir = (config: AiLocalProviderConfig) => config.modelDir || path.join(configDir, "llm-models");

/**
 * Downloads the model if it is not already cached.
 *
 * Temporary name and rename on success, so an interrupted download cannot
 * leave a truncated file that looks cached and then fails confusingly on every
 * later run. Progress is logged because this is several gigabytes and
 * otherwise the first analysis looks hung.
 */
/**
 * What the model download is doing, or undefined when nothing is downloading.
 *
 * Module state rather than a callback threaded through the provider, the
 * server and the analysis call. Only one download can be in flight - the
 * server is a singleton and the model is fetched once - and the consumer is a
 * status message that is polled, so it wants to read a current value rather
 * than be pushed one.
 */
export type LocalModelDownloadState = { label: string; percent: number };
let localModelDownload: LocalModelDownloadState | undefined;

/**
 * What setting the local engine up is doing, when it is doing anything.
 *
 * Deliberately separate from the analysis step counter rather than being a
 * step in it. The download has a real percentage and the steps do not, so
 * folding them together would flatten the better signal into the coarser one -
 * and setup is conditional, so it would make the step total mean different
 * things on different runs.
 */
let localSetupStatus: string | undefined;

/** For a status message: what, if anything, is being downloaded right now. */
export const getLocalModelDownload = (): LocalModelDownloadState | undefined => localModelDownload;

/**
 * For a status message: what the engine is doing before analysis can start.
 *
 * Undefined once the server is up and answering, which is the common case -
 * the server is kept alive between runs, so most analyses skip this entirely.
 */
export const getLocalSetupStatus = (): string | undefined =>
  localModelDownload
    ? `Downloading ${localModelDownload.label} (${localModelDownload.percent}%) - first use only`
    : localSetupStatus;

export const ensureLocalModel = async (config: AiLocalProviderConfig): Promise<string> => {
  const info = AiLocalModels[config.model];
  const modelDir = resolveModelDir(config);
  const modelPath = path.join(modelDir, info.fileName);
  if (await fileExists(modelPath)) {
    return modelPath;
  }
  await fs.promises.mkdir(modelDir, { recursive: true });
  const gib = (info.approxBytes / 1024 ** 3).toFixed(2);
  logger.log("info", `Downloading ${info.label} (${gib} GiB, first use only) from ${info.url}`);
  const response = await fetch(info.url);
  if (!response.ok || !response.body) {
    throw new Error(`Could not download ${info.label}: ${response.status} ${response.statusText}`);
  }
  const tempPath = `${modelPath}.${process.pid}.partial`;
  try {
    let written = 0;
    let lastLoggedPercent = -1;
    const handle = await fs.promises.open(tempPath, "w");
    try {
      for await (const chunk of response.body as any) {
        await handle.write(chunk);
        written += chunk.length;
        const percent = Math.min(Math.floor((written / info.approxBytes) * 100), 100);
        // Published every chunk, unlike the log line below - it is read on
        // demand rather than written anywhere, so it costs nothing to keep
        // current and a status that only moved every 5% would look stuck.
        localModelDownload = { label: info.label, percent };
        // Every 5%, so a long download says something without flooding the log.
        if (percent >= lastLoggedPercent + 5) {
          lastLoggedPercent = percent;
          logger.log("info", `${info.label}: ${percent}% downloaded`);
        }
      }
    } finally {
      await handle.close();
    }
    await fs.promises.rename(tempPath, modelPath);
  } catch (e) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw e;
  } finally {
    // Cleared on the way out however this ended, so a failed download does
    // not leave a status claiming it is still going.
    localModelDownload = undefined;
  }
  logger.log("info", `${info.label} downloaded to ${modelPath}`);
  return modelPath;
};

/**
 * The binary. The Docker image builds llama.cpp and sets LLAMA_SERVER_BINARY;
 * outside it, whatever is on the PATH - the same arrangement Whisper uses.
 */
const resolveBinary = (config: AiLocalProviderConfig) =>
  config.binaryPath || process.env.LLAMA_SERVER_BINARY || "llama-server";

/** Leaves a couple of cores for everything else the machine is doing. */
const resolveThreads = (config: AiLocalProviderConfig) =>
  config.threads ?? Math.max(1, (os.cpus()?.length ?? 4) - 2);

const HEALTH_TIMEOUT_MS = 10 * 60_000;
const HEALTH_POLL_MS = 1000;

/**
 * The shortest the model is ever held after going idle.
 *
 * One analysis makes two calls - classify and summarise, then extract - and
 * each releases the server between them. With an idle shutdown of zero that
 * gap is enough to unload the model and load it again mid-run, which on a
 * six-gigabyte model off a slow mount costs minutes for nothing. Observed
 * doing exactly that.
 *
 * So "unload immediately" means "as soon as the run is actually over", not
 * "in the pause between two halves of one job". A minute of held memory is a
 * far smaller cost than reloading, and anyone setting zero wants their RAM
 * back after the work - not during it.
 */
const MIN_IDLE_SECONDS = 60;

/**
 * One llama-server, started when needed and dropped when idle.
 *
 * Held rather than spawned per call because loading the model is seconds and
 * several gigabytes; doing that per analysis would dominate a backfill. Held
 * only while it is being used, because those gigabytes belong to the rest of
 * the machine the moment the work stops.
 */
export class LocalLlamaServer {
  private process?: ChildProcess;
  private starting?: Promise<string>;
  private baseUrl?: string;
  private inFlight = 0;
  private idleTimer?: NodeJS.Timeout;

  constructor(private config: AiLocalProviderConfig) {}

  /** Replaces the config without disturbing a running server. */
  update(config: AiLocalProviderConfig) {
    this.config = config;
  }

  /**
   * A base URL to call, starting a server first if that is this app's job.
   *
   * Callers must pair this with release(), which is what keeps the idle
   * shutdown from firing underneath work that is still running.
   */
  async acquire(): Promise<string> {
    this.inFlight++;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
    try {
      const external = this.config.serverUrl?.trim();
      if (external) {
        return external;
      }
      if (this.baseUrl && this.process && !this.process.killed) {
        return this.baseUrl;
      }
      // Collapsed so several analyses starting together load one model rather
      // than racing to start several servers on the same port.
      this.starting ??= this.start().finally(() => {
        this.starting = undefined;
      });
      return await this.starting;
    } catch (e) {
      this.inFlight--;
      throw e;
    }
  }

  release() {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (this.inFlight > 0 || this.config.serverUrl?.trim() || !this.process) {
      return;
    }
    const seconds = Math.max(this.config.idleShutdownSeconds, MIN_IDLE_SECONDS);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (this.inFlight === 0) {
        void this.stop();
      }
    }, seconds * 1000);
    // Never hold the process open just to run a shutdown timer.
    this.idleTimer.unref?.();
  }

  private async start(): Promise<string> {
    const modelPath = await ensureLocalModel(this.config);
    const binary = resolveBinary(this.config);
    const args = [
      "-m", modelPath,
      "-c", String(this.config.contextSize),
      "--host", "127.0.0.1",
      "--port", String(this.config.port),
      "-t", String(resolveThreads(this.config)),
      /*
       * Offloads what fits and is simply ignored on a CPU-only build, so the
       * same arguments work on a GPU box and a microserver alike.
       *
       * Zero when the GPU is switched off, which is how llama.cpp is told to
       * stay on the CPU - there is no separate flag for it.
       */
      "-ngl", String(this.config.useGpu === false ? 0 : this.config.gpuLayers ?? 999),
    ];
    logger.log("info", `Starting local analysis server: ${binary} ${args.join(" ")}`);
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    this.process = child;

    child.on("exit", (code, signal) => {
      logger.log("info", `Local analysis server exited (code ${code}, signal ${signal})`);
      if (this.process === child) {
        this.process = undefined;
        this.baseUrl = undefined;
      }
    });
    // llama.cpp is chatty on stderr; kept at debug so a failure to start is
    // still recoverable from the log without drowning it in normal running.
    child.stderr?.on("data", (chunk) => logger.log("debug", `llama-server: ${String(chunk).trim()}`));

    const baseUrl = `http://127.0.0.1:${this.config.port}`;
    /*
     * Set here rather than earlier: the process has spawned, so from now on
     * the wait really is the model loading. Anything that failed before this
     * point failed synchronously and never got as far as loading anything.
     *
     * Not instant and otherwise invisible - measured at ~40s for a 22GB model
     * with experts on CPU, and a cold read from a network disk is minutes,
     * during which an analysis looks hung.
     */
    localSetupStatus = `Starting the local model (${AiLocalModels[this.config.model]?.label ?? this.config.model})`;
    try {
      await this.waitForHealth(baseUrl, child);
    } finally {
      // However that ended. A failed start must not leave a status insisting
      // the model is still on its way.
      localSetupStatus = undefined;
    }
    this.baseUrl = baseUrl;
    logger.log("info", `Local analysis server ready on ${baseUrl} (${AiLocalModels[this.config.model].label})`);
    return baseUrl;
  }

  /**
   * Waits for the model to finish loading.
   *
   * Generously, because this is gigabytes off disk - measured at seconds from
   * page cache and a minute and a half from a slow mount. Gives up if the
   * process dies, so a bad binary or a corrupt model fails immediately rather
   * than after the full timeout.
   */
  private async waitForHealth(baseUrl: string, child: ChildProcess) {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.killed) {
        throw new Error("Local analysis server exited before it was ready - see the log for why");
      }
      try {
        const response = await fetch(`${baseUrl}/health`);
        if (response.ok) {
          return;
        }
      } catch {
        // Not listening yet, which is the normal case while loading.
      }
      await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS));
    }
    throw new Error(`Local analysis server did not become ready within ${HEALTH_TIMEOUT_MS / 60000} minutes`);
  }

  async stop() {
    const child = this.process;
    if (!child) {
      return;
    }
    this.process = undefined;
    this.baseUrl = undefined;
    logger.log("info", "Stopping local analysis server (idle)");
    child.kill();
  }
}
