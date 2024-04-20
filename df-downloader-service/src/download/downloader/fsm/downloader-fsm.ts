import { ActionMap, FSMBuilder } from "../../../fsm/fsm.js";
import { DownloadContext } from "./download-context.js";
import {
  cancelHandler,
  cleanupHandler,
  connectionCompletedHandler,
  connectionStateChangedHandler,
  initialStartHandler,
  restartHandler,
  resumeHandler,
} from "./downloader-fsm-action-handlers.js";
import { DownloadActions, DownloadStates } from "./types.js";

const defaultActionHandlers: Partial<ActionMap<DownloadStates, DownloadActions, DownloadContext>> = {
  connection_completed: connectionCompletedHandler,
  connection_state_changed: connectionStateChangedHandler,
  restart: restartHandler,
  finalise: ({ context, payload }) => {
    context.result = payload;
    return payload.status;
  },
};

export const DownloadFSM = FSMBuilder<DownloadStates, DownloadActions, DownloadContext>({
  initialState: "idle",
  label: "DownloadFSM",
  transitions: {
    idle: {
      start: ({ dispatch }) => {
        dispatch("initial_start");
        return "starting";
      },
      cancel: ({ dispatch }) => {
        dispatch("finalise", {
          status: "cancelled",
        });
        return "cancelling";
      },
    },
    awaiting_retry: {
      start: ({ dispatch }) => {
        dispatch("initial_start");
        return "starting";
      },
    },
    starting: {
      ...defaultActionHandlers,
      cancel: ({ dispatch }) => {
        dispatch("cleanup", {
          finaliseWith: {
            status: "cancelled",
          },
        });
        return "cleaning_up";
      },
      initial_start: initialStartHandler,
      resume: resumeHandler,
      start_connections: ({ context }) => {
        for (const { connection } of context.connections) {
          if (context.currentEtag) {
            connection.getHeaders().set("If-Match", context.currentEtag);
          }
          connection.start();
        }
        return "connections_starting";
      },
      cleanup: cleanupHandler,
      pause: ({}) => {
        // This can effectively do nothing as the connections will be paused
        return "paused";
      },
    },
    connections_starting: {
      ...defaultActionHandlers,
      cancel: cancelHandler,
    },
    downloading: {
      ...defaultActionHandlers,
      pause: ({ context }) => {
        context.connections.forEach(({ connection }) => connection.pause());
        return "pausing";
      },
      cancel: cancelHandler,
    },
    pausing: {
      ...defaultActionHandlers,
      cancel: cancelHandler,
    },
    paused: {
      ...defaultActionHandlers,
      start: ({ dispatch }) => {
        dispatch("resume");
        return "starting";
      },
      cancel: cancelHandler,
    },
    cancelling: {
      ...defaultActionHandlers,
    },
    cleaning_up: {
      ...defaultActionHandlers,
      cleaned_up: ({ payload }) => payload.preCleanupState,
    },
    cancelled: {
      cleanup: cleanupHandler,
    },
    restarting: {
      connection_completed: ({ dispatch, context, payload }) => {
        const { connectionIndex, result } = payload;
        context.connections[connectionIndex].result = result;
        const allCompleted = context.connections.every(({ result }) => Boolean(result));
        if (allCompleted) {
          dispatch("initial_start");
          return "starting";
        }
        return "restarting";
      },
    },
    success: null,
    failed: {
      prepare_for_retry: ({ context }) => {
        context.result = null;
        return "awaiting_retry";
      },
      cleanup: cleanupHandler,
      connection_state_changed: "failed",
    },
  },
});
export type DownloadFSM = ReturnType<typeof DownloadFSM>;
