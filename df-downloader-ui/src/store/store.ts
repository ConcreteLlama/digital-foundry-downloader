import { configureStore } from "@reduxjs/toolkit";
import listenerMiddleware from "./listener";
import { dfContentReducer } from "./df-content/df-content.reducer";
import { dfTagsReducer } from "./df-tags/df-tags.reducer";
import { downloadQueueReducer } from "./download-queue/download-queue.reducer";
import { dfUserReducer } from "./df-user/df-user.reducer";
import { configReducer } from "./config/config.reducer";
import { serviceInfoReducer } from "./service-info/service-info.reducer";
import { authUserReducer } from "./auth-user/auth-user.reducer";

//TODO: Create a service status store to make it clear when it's updating etc.
export const store = configureStore({
  reducer: {
    dfContent: dfContentReducer,
    dfTags: dfTagsReducer,
    downloadQueue: downloadQueueReducer,
    dfUserInfo: dfUserReducer,
    config: configReducer,
    serviceInfo: serviceInfoReducer,
    authUser: authUserReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).prepend(listenerMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
