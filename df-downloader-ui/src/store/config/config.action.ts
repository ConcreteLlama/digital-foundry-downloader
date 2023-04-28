import { createQueryActions } from "../utils";
import { DfDownloaderConfig, DfDownloaderConfigKey } from "df-downloader-common/config/df-downloader-config.js";

// Action to get either the whole config or a specific field
type QueryConfigSectionPayload = {
  section: DfDownloaderConfigKey;
  value: DfDownloaderConfig[DfDownloaderConfigKey];
};
export const queryConfigSection = createQueryActions<DfDownloaderConfigKey, QueryConfigSectionPayload>(
  "config",
  "QUERY_CONFIG_SECTION"
);

// Action to update the config
// export const updateConfig = createQueryActions<Partial<DfDownloaderConfig>, DfDownloaderConfig>(
//   "config",
//   "UPDATE_CONFIG"
// );

type UpdateSectionPayload = {
  section: DfDownloaderConfigKey;
  value: DfDownloaderConfig[DfDownloaderConfigKey];
};
export const updateConfigSection = createQueryActions<UpdateSectionPayload, UpdateSectionPayload>(
  "config",
  "UPDATE_CONFIG_SECTION"
);
