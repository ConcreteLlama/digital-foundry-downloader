import { logger } from "df-downloader-common";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config.js";
import fs, { mkdirSync } from "fs";
import path from "path";
import YAML from "yaml";
import { fromZodError } from "zod-validation-error";
import { code_dir } from "../utils/file-utils.js";
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
  static patchConfig(rawConfig: any) {
    let patched: boolean = false;
    if (rawConfig.subtitles) {
      if (rawConfig.subtitles.subtitlesService) {
        patched = true;
        rawConfig.subtitles.autoGenerateSubs = true;
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
