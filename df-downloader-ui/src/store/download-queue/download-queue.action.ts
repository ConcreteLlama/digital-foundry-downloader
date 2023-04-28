import { QueueDownloadRequest, QueuedContent } from "df-downloader-common";
import { createQueryActions } from "../utils";

export const queryDownloadQueue = createQueryActions<void, QueuedContent[]>("downloadQueue", "QUERY_DOWNLOAD_QUEUE");
export const startDownload = createQueryActions<QueueDownloadRequest, QueuedContent>("downloadQueue", "START_DOWNLOAD");
