import { createListenerMiddleware, TypedStartListening } from "@reduxjs/toolkit";
import { startListeningDfContentInfo } from "./df-content/df-content.listeners";
import { startListeningDfTags } from "./df-tags/df-tags.listeners";
import { startListeningDownloadQueue } from "./download-queue/download-queue.listeners";
import { RootState, AppDispatch } from "./store";
import { startListeningDfUserInfo } from "./df-user/df-user.listener";
import { startListeneingConfig } from "./config/config.listener";
import { startListeningServiceInfo } from "./service-info/service-info.listener";
import { startListeningAuthUser } from "./auth-user/auth-user.listener";

export const listenerMiddleware = createListenerMiddleware();
export type AppStartListening = TypedStartListening<RootState, AppDispatch>;

export const startAppListening = listenerMiddleware.startListening as AppStartListening;

startListeningServiceInfo(startAppListening);
startListeningDfUserInfo(startAppListening);
startListeningDfContentInfo(startAppListening);
startListeningDfTags(startAppListening);
startListeningDownloadQueue(startAppListening);
startListeningDfUserInfo(startAppListening);
startListeneingConfig(startAppListening);
startListeningAuthUser(startAppListening);

export default listenerMiddleware;
