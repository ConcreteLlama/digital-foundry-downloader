import fs from "fs";
import path from "path";
import YAML from "yaml";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config.js";
import { ConfigService } from "./config-service.js";
import { fromZodError } from "zod-validation-error";
import { code_dir } from "../utils/file-utils.js";

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
      const sampleFilePath = path.join(code_dir, "config_samples", "config.sample.yaml");
      fs.copyFileSync(sampleFilePath, configFilePath);
      configStr = fs.readFileSync(configFilePath, "utf-8");
    }

    const configPlain = YAML.parse(configStr);
    const result = DfDownloaderConfig.safeParse(configPlain);
    if (!result.success) {
      throw new Error(fromZodError(result.error).toString());
    }
    const config = result.data;

    return new FileConfig(config, configFilePath);
  }
  get config() {
    return this.cachedConfig;
  }
  async writeConfig(config: DfDownloaderConfig) {
    this.cachedConfig = config;
    await fs.promises.writeFile(this.configFilePath, YAML.stringify(this.cachedConfig));
  }
}
