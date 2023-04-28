import { z } from "zod";
import { ContentManagementConfig, ContentManagementConfigKey } from "./content-management-config.js";
import { DownloadsConfig, DownloadsConfigKey } from "./download-config.js";
import { RestApiConfig, RestApiConfigKey } from "./rest-config.js";
import { NotificationsConfig, NotificationsConfigKey } from "./notification-config.js";
import { DfConfig, DfConfigKey } from "./df-config.js";
import { LoggingConfig, LoggingConfigKey } from "./logging-config.js";
import { MetadataConfig, MetadataConfigKey } from "./metadata-config.js";
import { SubtitlesConfig, SubtitlesConfigKey } from "./subtitles-config.js";
import { ContentDetectionConfig, ContentDetectionConfigKey } from "./content-detection-config.js";
import { AutomaticDownloadsConfig, AutomaticDownloadsConfigKey } from "./automatic-downloads-config.js";

// What is NEEDED to function?
// DF session ID - but null is fine, means we're logged out
// Work dir (can have default - "work_dir")
// Destination dir (can have default)

// TODO: Create a secrets and a non secrets version of this config then merge them for the absolute config

export const DfDownloaderConfig = z.object({
  [DfConfigKey]: DfConfig,
  [ContentDetectionConfigKey]: ContentDetectionConfig,
  [AutomaticDownloadsConfigKey]: AutomaticDownloadsConfig,
  [ContentManagementConfigKey]: ContentManagementConfig,
  [DownloadsConfigKey]: DownloadsConfig.default({}),
  [RestApiConfigKey]: RestApiConfig.default({
    http: {
      port: 44556,
    },
  }),
  [MetadataConfigKey]: MetadataConfig.default({
    injectMetadata: true,
  }),
  [SubtitlesConfigKey]: SubtitlesConfig.optional(),
  [NotificationsConfigKey]: NotificationsConfig.optional(),
  [LoggingConfigKey]: LoggingConfig,
});
export type DfDownloaderConfig = z.infer<typeof DfDownloaderConfig>;
export type DfDownloaderConfigInput = z.input<typeof DfDownloaderConfig>;
export type DfDownloaderConfigKey = Extract<keyof DfDownloaderConfig, string>;
export const DfDownloaderConfigKeys = Object.keys(DfDownloaderConfig.shape) as DfDownloaderConfigKey[];