import { z } from "zod";
import { AppStartListening } from "../listener";
import { queryDownloadQueue, startDownload } from "./download-queue.action";
import { QueuedContent } from "df-downloader-common";
import { addFetchListener } from "../utils";
import { API_URL } from "../../config";

const DownloadQueueResponse = z.array(QueuedContent);

export const startListeningDownloadQueue = (startListening: AppStartListening) => {
  addFetchListener(startListening, queryDownloadQueue, DownloadQueueResponse, (payload) => [
    `${API_URL}/downloads/queue`,
  ]);
  addFetchListener(startListening, startDownload, QueuedContent, (payload) => [
    `${API_URL}/downloads/queue`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  ]);

  // let lastProgress = 0;

  // //*

  // const makeFakeItem = (dfContentEntry: DfContentEntry, progress: number) => {
  //   const totalBytes = 4887579900;
  //   const toReturn: QueuedContent = {
  //     name: dfContentEntry.name,
  //     dfContent: dfContentEntry.contentInfo,
  //     contentStatus: QueuedContentStatus.DOWNLOADING,
  //     readyForRetry: false,
  //     selectedMediaInfo: dfContentEntry.contentInfo.mediaInfo[0]!,
  //     currentAttempt: 1,
  //     currentProgress: {
  //       totalBytesDownloaded: totalBytes * progress,
  //       totalBytes: totalBytes,
  //       retries: 0,
  //       percentComplete: progress,
  //       bytesPerSecond: 33947648,
  //       startTime: new Date(),
  //       durationMillis: 14069,
  //       averageBytesPerSecond: 4844330.158504514,
  //     },
  //     statusInfo: "Downloading",
  //     currentRetryInterval: 0,
  //     originalDetectionTime: new Date(),
  //   };
  //   return toReturn;
  // };

  // startListening({
  //   actionCreator: queryDownloadQueue.start,
  //   effect: async (action, listenerApi) => {
  //     try {
  //       lastProgress = Math.min(lastProgress + 0.005, 1);
  //       const responseBody = store
  //         .getState()
  //         .dfContent.content.slice(0, 10)
  //         .map((dfContentItem) => makeFakeItem(dfContentItem, lastProgress));
  //       const parsed = DownloadQueueResponse.parse(responseBody);
  //       listenerApi.dispatch(queryDownloadQueue.success(parsed));
  //     } catch (e) {
  //       console.log(e);
  //       listenerApi.dispatch(queryDownloadQueue.failed(ensureDfUiError(e)));
  //     }
  //   },
  // });
};
