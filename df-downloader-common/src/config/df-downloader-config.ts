import { z } from "zod";
import { ContainerContentManagementConfig, ContentManagementConfig, ContentManagementConfigKey } from "./content-management-config.js";
import { DownloadsConfig, DownloadsConfigKey } from "./download-config.js";
import { DefaultRestApiConfig, RestApiConfig, RestApiConfigKey } from "./rest-config.js";
import { NotificationsConfig, NotificationsConfigKey } from "./notifications-config.js";
import { DfConfig, DfConfigKey } from "./df-config.js";
import { DefaultLoggingConfig, LoggingConfig, LoggingConfigKey } from "./logging-config.js";
import { DefaultMetadataConfig, MetadataConfig, MetadataConfigKey } from "./metadata-config.js";
import { SubtitlesConfig, SubtitlesConfigKey } from "./subtitles-config.js";
import { ContentDetectionConfig, ContentDetectionConfigKey } from "./content-detection-config.js";
import { AutomaticDownloadsConfig, AutomaticDownloadsConfigKey } from "./automatic-downloads-config.js";
import { AuthenticationConfig, AuthenticationConfigKey, DefaultAuthenticationConfig } from "./auth-config.js";
import { DevConfig, DevConfigKey } from "./dev-config.js";
import { MediaFormatsConfigKey, MediaFormatsConfig } from "./media-formats-config.js";

export const DfDownloaderConfig = z.object({
  [DfConfigKey]: DfConfig.default({}),
  [ContentDetectionConfigKey]: ContentDetectionConfig.default({}),
  [AutomaticDownloadsConfigKey]: AutomaticDownloadsConfig.default({}),
  [ContentManagementConfigKey]: ContentManagementConfig.default({}),
  [DownloadsConfigKey]: DownloadsConfig.default({}),
  [MediaFormatsConfigKey]: MediaFormatsConfig.default({}),
  [AuthenticationConfigKey]: AuthenticationConfig.default(DefaultAuthenticationConfig),
  [RestApiConfigKey]: RestApiConfig.default(DefaultRestApiConfig),
  [MetadataConfigKey]: MetadataConfig.default(DefaultMetadataConfig),
  [SubtitlesConfigKey]: SubtitlesConfig.optional(),
  [NotificationsConfigKey]: NotificationsConfig.optional(),
  [LoggingConfigKey]: LoggingConfig.default(DefaultLoggingConfig),
  [DevConfigKey]: DevConfig.optional(),
});
export type DfDownloaderConfig = z.infer<typeof DfDownloaderConfig>;
export type DfDownloaderConfigInput = z.input<typeof DfDownloaderConfig>;
export type DfDownloaderConfigKey = Extract<keyof DfDownloaderConfig, string>;
export const DfDownloaderConfigKeys = Object.keys(DfDownloaderConfig.shape) as DfDownloaderConfigKey[];

export const DfDownloaderContainerConfig = DfDownloaderConfig.extend({
  [ContentManagementConfigKey]: ContainerContentManagementConfig.default({}),
});