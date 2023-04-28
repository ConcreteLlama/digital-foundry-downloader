import { DfUiError } from "../../utils/error";
import { QueryableState } from "../utils";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config.js";

export interface ConfigState extends QueryableState {
  loading: boolean;
  error: DfUiError | null;
  config: Partial<DfDownloaderConfig> | null;
}
