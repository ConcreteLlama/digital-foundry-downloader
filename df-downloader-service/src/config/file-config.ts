import fs from "fs";
import fsPromise from "fs/promises";
import path from "path";
import YAML from "yaml";
import { DfDownloaderConfig, DfDownloaderConfigInput } from "df-downloader-common/config/df-downloader-config.js";
import { ConfigService } from "./config-service.js";
import { fromZodError } from "zod-validation-error";
import { code_dir } from "../utils/file-utils.js";

export class FileConfig extends ConfigService {
  constructor(private config: DfDownloaderConfig, private path: fs.PathLike) {
    super();
    this.config = config;
  }
  static async create(dir: string) {
    const configFilePath = path.join(dir, "config.yaml");
    let configStr = await fsPromise.readFile(configFilePath, "utf-8").catch((e) => {});
    if (!configStr) {
      const sampleFilePath = path.join(code_dir, "config_samples", "config.sample.yaml");
      await fsPromise.copyFile(sampleFilePath, configFilePath);
      configStr = await fsPromise.readFile(configFilePath, "utf-8");
    }

    const configPlain = YAML.parse(configStr);
    const result = DfDownloaderConfig.safeParse(configPlain);
    if (!result.success) {
      throw new Error(fromZodError(result.error).toString());
    }
    const config = result.data;

    return new FileConfig(config, configFilePath);
  }
  getConfig() {
    return this.config;
  }
  async writeConfig(config: DfDownloaderConfig) {
    this.config = config;
    await fsPromise.writeFile(this.path, YAML.stringify(this.config));
  }
}
