import _ from "lodash";
import { DfDownloaderConfig, DfDownloaderConfigInput } from "df-downloader-common/config/df-downloader-config";
import { TypedEventEmitter } from "../utils/event-emitter.js";

export interface ConfigFieldUpdateEvent<T> {
  oldValue: T;
  newValue: T;
}

type GenericUpdateEvent<T> = {
  [K in keyof T as `configUpdated:${string & K}`]: ConfigFieldUpdateEvent<T[K]>;
};

type ConfigFieldUpdateEvents = GenericUpdateEvent<DfDownloaderConfig>;

export interface ConfigUpdateEvents extends ConfigFieldUpdateEvents {
  configUpdated: ConfigFieldUpdateEvent<DfDownloaderConfig>;
}

export abstract class ConfigService extends TypedEventEmitter<ConfigUpdateEvents> {
  async updateConfig(config: Partial<DfDownloaderConfigInput>) {
    const oldConfig = this.config;
    const cleanedConfig = _.pickBy(config, (value) => value !== undefined);
    const newConfig: DfDownloaderConfig = {
      ...oldConfig,
      ...cleanedConfig,
    };
    await this.writeConfig(newConfig);
    this.emitFieldUpdateEvents(oldConfig, this.config);
    return this.config;
  }

  private emitFieldUpdateEvents(oldConfig: DfDownloaderConfig, newConfig: DfDownloaderConfig) {
    this.emit("configUpdated", {
      oldValue: oldConfig,
      newValue: newConfig,
    });
    const fields = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);

    fields.forEach((field) => {
      const key = field as keyof DfDownloaderConfig;
      if (oldConfig[key] !== newConfig[key]) {
        this.emit(`configUpdated:${key}`, {
          oldValue: oldConfig[key] as any,
          newValue: newConfig[key] as any,
        });
      }
    });
  }
  abstract get config(): DfDownloaderConfig;
  abstract writeConfig(config: DfDownloaderConfig): void | Promise<void>;
  init(): Promise<void> | void {}
}
