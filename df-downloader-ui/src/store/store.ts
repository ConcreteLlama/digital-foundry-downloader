import { configureStore } from "@reduxjs/toolkit";
import listenerMiddleware from "./listener";
import { dfContentReducer } from "./df-content/df-content.reducer";
import { dfTagsReducer } from "./df-tags/df-tags.reducer";
import { downloadQueueReducer } from "./download-queue/download-queue.reducer";
import { userReducer } from "./user/user.reducer";
import { configReducer } from "./config/config.reducer";
import { serviceInfoReducer } from "./service-info/service-info.reducer";

//TODO: Create a service status store to make it clear when it's updating etc.
export const store = configureStore({
  reducer: {
    dfContent: dfContentReducer,
    dfTags: dfTagsReducer,
    downloadQueue: downloadQueueReducer,
    userInfo: userReducer,
    config: configReducer,
    serviceInfo: serviceInfoReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: true,
    }).prepend(listenerMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
