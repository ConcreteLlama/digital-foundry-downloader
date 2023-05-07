import { createSelector } from "@reduxjs/toolkit";
import { store } from "../store";
import { createDeepEqualSelector } from "../utils";

const selectSelf = (state: ReturnType<typeof store.getState>) => state.downloadQueue;
const selectQueue = (state: ReturnType<typeof store.getState>) => state.downloadQueue.downloadQueue;

export const selectDownloadQueue = createDeepEqualSelector(selectQueue, (downloadQueue) => downloadQueue);

export const selectDownloadItem = (key: string) =>
  createSelector(selectSelf, (downloadQueue) => {
    const match = downloadQueue.downloadQueue.find((item) => item.name === key);
    if (!match) {
      return undefined;
    }
    return match;
  });
