import { logger } from "df-downloader-common";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config.js";
import fs, { mkdirSync } from "fs";
import path from "path";
import YAML from "yaml";
import { fromZodError } from "zod-validation-error";
import { code_dir, ensureDirectory } from "../utils/file-utils.js";
import { CURRENT_VERSION } from "../version.js";
import { DfDownloaderServiceConfigSchema } from "./config-schema.js";
import { ConfigService } from "./config-service.js";

export class FileConfig extends ConfigService {
  constructor(private cachedConfig: DfDownloaderConfig, private configFilePath: fs.PathLike) {
    super();
    this.cachedConfig = cachedConfig;
  }
  static create(dir: string) {
    const configFilePath = path.join(dir, "config.yaml");
    let configStr: string | undefined;
    try {
      configStr = fs.readFileSync(configFilePath, "utf-8");
    } catch (e) {}
    if (!configStr) {
      mkdirSync(dir, {
        recursive: true,
      });
      const sampleFilePath = path.join(code_dir, "config_samples", "config.sample.yaml");
      fs.copyFileSync(sampleFilePath, configFilePath);
      configStr = fs.readFileSync(configFilePath, "utf-8");
    }

    const configPlain = YAML.parse(configStr) || {};
    const patched = this.patchConfig(configPlain);
    const result = DfDownloaderServiceConfigSchema.safeParse(configPlain);
    if (!result.success) {
      throw new Error(fromZodError(result.error).toString());
    }
    if (patched) {
      FileConfig.backupConfig(dir, configStr);
      fs.writeFileSync(configFilePath, YAML.stringify(result.data));
    }
    const config = result.data;
    logger.log("silly", `Full config:\n\n${JSON.stringify(config, null, 2)}`);
    return new FileConfig(config, configFilePath);
  }
  get config() {
    return this.cachedConfig;
  }
  async writeConfig(config: DfDownloaderConfig) {
    this.cachedConfig = config;
    await fs.promises.writeFile(this.configFilePath, YAML.stringify(this.cachedConfig));
  }
  /**
   * Keeps a copy of the config as it was before a patch rewrote it.
   *
   * Follows the FileDb convention - a `backups/` directory beside the file,
   * named with the version being left behind and a timestamp, so successive
   * upgrades do not overwrite each other. Like FileDb, a backup is only kept
   * when a patch actually happened; unlike FileDb, which copies first and
   * deletes the copy if nothing changed, this is written after the fact
   * because the original text is still in hand.
   *
   * Writing that original text rather than re-serialising matters here.
   * Patching rewrites the whole file from the parsed object, so comments and
   * formatting are lost on any patch whether or not it touched them - the
   * backup is the only thing that preserves them.
   *
   * Best-effort by design: failing to write a backup must not stop the app
   * starting, since the config it would have protected is still valid and
   * still about to be written correctly.
   */
  private static backupConfig(dir: string, originalConfig: string) {
    try {
      const backupDir = path.join(dir, "backups");
      ensureDirectory(backupDir);
      const backupPath = path.join(backupDir, `config-${CURRENT_VERSION}-${Date.now()}.yaml`);
      fs.writeFileSync(backupPath, originalConfig);
      logger.log("info", `Config patched - previous version backed up to ${backupPath}`);
    } catch (e) {
      logger.log("warn", `Could not back up config before patching: ${e}`);
    }
  }

  static patchConfig(rawConfig: any) {
    let patched: boolean = false;
    /*
     * subtitles.maxConcurrent became localModels.maxConcurrent.
     *
     * Transcription and local analysis now share one queue, so the limit
     * belongs to that queue rather than to subtitles - see
     * docs/LOCAL_MODELS_QUEUE_DESIGN.md. Carried across rather than dropped,
     * because someone who deliberately raised it should not silently find it
     * back at 1; only moved when the new key is absent, so a value set since
     * wins.
     */
    if (rawConfig.subtitles && rawConfig.subtitles.maxConcurrent !== undefined) {
      patched = true;
      if (rawConfig.localModels?.maxConcurrent === undefined) {
        rawConfig.localModels = { ...rawConfig.localModels, maxConcurrent: rawConfig.subtitles.maxConcurrent };
      }
      delete rawConfig.subtitles.maxConcurrent;
    }
    if (rawConfig.subtitles) {
      if (rawConfig.subtitles.subtitlesService) {
        patched = true;
        rawConfig.subtitles.automaticGeneration = "during_download";
        rawConfig.subtitles.servicePriorities = [rawConfig.subtitles.subtitlesService];
        delete rawConfig.subtitles.subtitlesService;
      }
      if (rawConfig.subtitles.deepgram) {
        patched = true;
        rawConfig.subtitles.services = {
          deepgram: rawConfig.subtitles.deepgram,
        };
        delete rawConfig.subtitles.deepgram;
      }
      // autoGenerateSubs became a three-way mode - subtitles can now be
      // generated during the download (as before), after it, or not
      // automatically at all. The boolean couldn't express "manual only",
      // which is the case someone wants when only some content is worth
      // subtitling.
      if (typeof rawConfig.subtitles.autoGenerateSubs === "boolean") {
        patched = true;
        rawConfig.subtitles.automaticGeneration = rawConfig.subtitles.autoGenerateSubs ? "during_download" : "off";
        delete rawConfig.subtitles.autoGenerateSubs;
      }
      // The "youtube" subtitles service was removed - YouTube stopped
      // serving captions to anything that can't produce a proof-of-origin
      // token, so it can no longer work at all (see the 2026-08-27 findings
      // in docs/ROADMAP.md). Strip it out rather than leaving it in the
      // schema: without this, every existing install that had it configured
      // would fail config validation on startup and refuse to boot.
      if (Array.isArray(rawConfig.subtitles.servicePriorities)) {
        const withoutYoutube = rawConfig.subtitles.servicePriorities.filter(
          (service: unknown) => service !== "youtube"
        );
        if (withoutYoutube.length !== rawConfig.subtitles.servicePriorities.length) {
          patched = true;
          rawConfig.subtitles.servicePriorities = withoutYoutube;
          logger.log(
            "warn",
            "Removed the 'youtube' subtitles service from your configuration - YouTube no longer serves captions to non-browser clients. Configure the 'whisper' service to transcribe locally, or Deepgram/Google STT to use a paid API."
          );
        }
      }
      if (rawConfig.subtitles.services?.youtube !== undefined) {
        patched = true;
        delete rawConfig.subtitles.services.youtube;
      }
    }
    if (rawConfig.automaticDownloads) {
      if (rawConfig.automaticDownloads.mediaTypes) {
        patched = true;
        rawConfig.mediaFormats = {
          ...(rawConfig.mediaFormats || {}),
          priorities: rawConfig.automaticDownloads.mediaTypes
        }
        delete rawConfig.automaticDownloads.mediaTypes;
      }
    }
    patched && logger.log("info", `Config pathed to latest schema`);
    return patched;
  }
}
