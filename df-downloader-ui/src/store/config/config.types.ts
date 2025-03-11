import { DfUiError } from "../../utils/error";
import { QueryableState } from "../utils";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config";

export type DfConfigSectionStateRecord<KEY extends keyof DfDownloaderConfig> = {
  initialised: boolean;
  loading: boolean;
  error: DfUiError | null;
  value: DfDownloaderConfig[KEY] | null;
}

export interface ConfigState extends QueryableState {
  loading: boolean;
  error: DfUiError | null;
  config: {
    [K in keyof Required<DfDownloaderConfig>]: DfConfigSectionStateRecord<K>;
  }
}
