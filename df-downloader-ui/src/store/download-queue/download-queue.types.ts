import { QueuedContent } from "df-downloader-common";
import { QueryableState } from "../utils";
import { DfUiError } from "../../utils/error";

export interface DownloadQueueState extends QueryableState {
  loading: boolean;
  downloadQueue: QueuedContent[];
  error: DfUiError | null;
}
