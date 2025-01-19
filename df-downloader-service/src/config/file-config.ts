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
        rawConfig.subtitles.services = {
          deepgram: rawConfig.subtitles.deepgram,
        };
        delete rawConfig.subtitles.deepgram;
      }
    }
    patched && logger.log("info", `Config pathed to latest schema`);
    return patched;
  }
}
