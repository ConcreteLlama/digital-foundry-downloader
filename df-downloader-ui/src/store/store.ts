import { configureStore } from "@reduxjs/toolkit";
import listenerMiddleware from "./listener";
import { dfContentReducer } from "./df-content/df-content.reducer";
import { dfTagsReducer } from "./df-tags/df-tags.reducer";
import { taskPipelinesReducer } from "./df-tasks/tasks.reducer";
import { dfUserReducer } from "./df-user/df-user.reducer";
import { configReducer } from "./config/config.reducer";
import { serviceInfoReducer } from "./service-info/service-info.reducer";
import { authUserReducer } from "./auth-user/auth-user.reducer";
import { tasksMiddleware } from "./df-tasks/tasks.middleware.ts";

//TODO: Create a service status store to make it clear when it's updating etc.
export const store = configureStore({
  reducer: {
    dfContent: dfContentReducer,
    dfTags: dfTagsReducer,
    tasks: taskPipelinesReducer,
    dfUserInfo: dfUserReducer,
    config: configReducer,
    serviceInfo: serviceInfoReducer,
    authUser: authUserReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    })
      .prepend(listenerMiddleware.middleware)
      .prepend(tasksMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
