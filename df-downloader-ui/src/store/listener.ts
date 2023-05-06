import { createListenerMiddleware, TypedStartListening } from "@reduxjs/toolkit";
import { startListeningDfContentInfo } from "./df-content/df-content.listeners";
import { startListeningDfTags } from "./df-tags/df-tags.listeners";
import { startListeningDownloadQueue } from "./download-queue/download-queue.listeners";
import { RootState, AppDispatch } from "./store";
import { startListeningUserInfo } from "./user/user.listener";
import { startListeneingConfig } from "./config/config.listener";
import { startListeningServiceInfo } from "./service-info/service-info.listener";

export const listenerMiddleware = createListenerMiddleware();
export type AppStartListening = TypedStartListening<RootState, AppDispatch>;

export const startAppListening = listenerMiddleware.startListening as AppStartListening;

startListeningServiceInfo(startAppListening);
startListeningUserInfo(startAppListening);
startListeningDfContentInfo(startAppListening);
startListeningDfTags(startAppListening);
startListeningDownloadQueue(startAppListening);
startListeningUserInfo(startAppListening);
startListeneingConfig(startAppListening);

export default listenerMiddleware;
