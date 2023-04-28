import { createSelector } from "@reduxjs/toolkit";
import { store } from "../store";

const selectSelf = (state: ReturnType<typeof store.getState>) => state.downloadQueue;
const selectQueue = (state: ReturnType<typeof store.getState>) => state.downloadQueue.downloadQueue;

export const selectDownloadQueue = createSelector(selectQueue, (downloadQueue) => downloadQueue);

export const selectDownloadItem = (key: string) =>
  createSelector(selectSelf, (downloadQueue) => {
    const match = downloadQueue.downloadQueue.find((item) => item.name === key);
    if (!match) {
      return undefined;
    }
    return match;
  });
