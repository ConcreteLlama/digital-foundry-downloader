import { FSMBuilder } from "../../../fsm/fsm.js";
import { DownloadConnectionContext } from "./download-connection-context.js";
import { DownloadConnectionError } from "./download-connection-error.js";
import {
  failedHandler,
  initialStartHandler,
  resumeHandler,
  retryHandler,
} from "./download-connection-fsm-action-handlers.js";
import { DownloadConnectionActions, DownloadConnectionStates } from "./types.js";

export const DownloadConnectionFSM = FSMBuilder<
  DownloadConnectionStates,
  DownloadConnectionActions,
  DownloadConnectionContext
>({
  initialState: "idle",
  label: "DownloadConnection",
  transitions: {
    idle: {
      start: ({ dispatch }) => {
        dispatch("initial_start");
        return "starting";
      },
    },
    starting: {
      initial_start: initialStartHandler,
      resume: resumeHandler,
    },
    downloading: {
      pause: ({ context }) => {
        const currentReader = context.currentReader;
        if (!currentReader) {
          console.error("Reader missing");
          return "downloading";
        }
        currentReader.cancel().catch((e) => {
          context.log("info", "Error cancelling", e);
        });
        return "pausing";
      },
      cancel: ({ context, dispatch }) => {
        const currentReader = context.currentReader;
        if (!currentReader) {
          console.error("Reader missing");
          return "downloading";
        }
        currentReader.cancel().catch((e) => {
          context.log("info", "Error cancelling", e);
          if (e instanceof TypeError) {
            context.log("info", "TypeError message: ", e.message, "name", e.name);
          }
          dispatch("cancelled");
        });
        return "cancelling";
      },
      stream_finished: ({ dispatch }) => {
        dispatch("success");
        return "completing";
      },
    },
    pausing: {
      stream_finished: () => "paused",
    },
    paused: {
      start: ({ dispatch }) => {
        dispatch("resume", "resume");
        return "starting";
      },
      cancel: ({ dispatch }) => {
        dispatch("cancelled");
        return "cancelling";
      },
    },
    cancelling: {
      stream_finished: ({ dispatch }) => {
        dispatch("cancelled");
        return "completing";
      },
    },
    awaiting_retry: {
      retry: retryHandler,
    },
    completing: {},
    success: null,
    cancelled: null,
    failed: {
      retry: retryHandler,
    },
  },
  defaultActionHandlers: {
    failed: failedHandler,
    success: ({ context }) => {
      context.result = {
        status: "success",
      };
      return "success";
    },
    cancelled: ({ context }) => {
      context.result = {
        status: "cancelled",
      };
      return "cancelled";
    },
  },
  defaultExceptionHandler: ({ error, dispatch }) => {
    dispatch(
      "failed",
      new DownloadConnectionError({
        message: "Unknown error",
        reason: "unknown",
        error,
      })
    );
  },
});
export type DownloadConnectionFSM = ReturnType<typeof DownloadConnectionFSM>;
