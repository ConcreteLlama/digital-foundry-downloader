import fsPromises from "fs/promises";
import { ActionFunction } from "../../../fsm/fsm.js";
import { DownloadConnectionStates } from "../../download-connection/fsm/types.js";
import { getResourceInfo, prepareFileForWriting } from "../../utils.js";
import { DownloadResult } from "../download-result.js";
import { DownloadContext } from "./download-context.js";
import { DownloadActions, DownloadStates } from "./types.js";
import { createConnections } from "./utils.js";

export const initialStartHandler: ActionFunction<DownloadStates, DownloadActions, DownloadContext, "initial_start"> = ({
  context,
  dispatch,
}) => {
  new Promise(async (resolve) => {
    context.startTime = new Date();
    const { destination } = context.options;

    try {
      // Check file
      await prepareFileForWriting(destination, true);
      // Resolve URL
      const url = await context.downloadUrl.resolve("initial");
      if (!url) {
        return dispatch("finalise", {
          status: "failed",
          error: new Error("Failed to resolve URL"),
        });
      }
      // Get capabilities
      const { etag, contentLength, acceptRange } = await getResourceInfo(url, context.options.headers);
      context.currentEtag = etag;
      // Create connections
      const rangeSupported = acceptRange?.includes("bytes");
      const maxConnections = rangeSupported ? context.options.maxConnections : 1;
      const connections = await createConnections(maxConnections, contentLength, context);
      context.setConnections(connections);
      connections.forEach((connection, index) => {
        connection.on("completed", (result) => {
          dispatch("connection_completed", { connectionIndex: index, result });
        });
        connection.on("stateChanged", (state) => {
          dispatch("connection_state_changed", { connectionIndex: index, connection, state });
        });
      });
      dispatch("start_connections");
    } catch (e) {
      dispatch("finalise", {
        status: "failed",
        error: e,
      });
    } finally {
      resolve("starting");
    }
  });
  return "starting";
};

export const resumeHandler: ActionFunction<DownloadStates, DownloadActions, DownloadContext, "resume"> = ({
  context,
  dispatch,
}) => {
  new Promise(async (resolve) => {
    try {
      const url = await context.downloadUrl.resolve("resume");
      if (!url) {
        return dispatch("finalise", {
          status: "failed",
          error: new Error("Failed to resolve URL"),
        });
      }
      const { etag } = await getResourceInfo(url, context.options.headers);
      if (etag !== context.currentEtag) {
        context.currentEtag = null;
        context.log("info", `ETag mismatch, starting fresh`);
        return dispatch("restart");
      }
      dispatch("start_connections");
    } catch (e) {
      context.log("error", "Error resuming", e);
      dispatch("finalise", {
        status: "failed",
        error: e,
      });
    } finally {
      resolve("starting");
    }
  });
  return "starting";
};

export const cleanupHandler: ActionFunction<DownloadStates, DownloadActions, DownloadContext, "cleanup"> = ({
  context,
  dispatch,
  payload,
  currentState: preCleanupState,
}) => {
  const finaliseWith = payload?.finaliseWith;

  // Remove the destination file
  const { destination } = context.options;
  const dispatchFinal = (finaliseWith?: DownloadResult | null) => {
    finaliseWith ? dispatch("finalise", finaliseWith) : dispatch("cleaned_up", { preCleanupState });
    return "cleaning_up";
  };
  fsPromises
    .unlink(destination)
    .then(() => {
      dispatchFinal(finaliseWith);
    })
    .catch((e) => {
      context.log("warn", "Error cleaning up", e);
      dispatchFinal(finaliseWith);
    });
  return "cleaning_up";
};

export const connectionCompletedHandler: ActionFunction<
  DownloadStates,
  DownloadActions,
  DownloadContext,
  "connection_completed"
> = ({ context, dispatch, payload, currentState }) => {
  const { connectionIndex, result } = payload;
  context.connections[connectionIndex].result = result;
  if (result.status === "failed") {
    context.log("info", `Connection ${connectionIndex} failed`, result);
    const incompleteConnections = context.connections.reduce((needingCompletion, { connection }, index) => {
      if (index !== connectionIndex && !connection.isCompleted()) {
        connection.cancel();
        return needingCompletion + 1;
      }
      return needingCompletion;
    }, 0);
    if (incompleteConnections > 0) {
      return currentState;
    }
  }
  const { cancelled, succeeded, failed, all } = context.reduceConnectionResults();
  context.log("info", `Connections completed`, { cancelled, succeeded, failed, all });
  if (failed.length > 0 && failed.length + succeeded.length + cancelled.length === context.connections.length) {
    dispatch("finalise", {
      status: "failed",
      error: {
        message: `One or more connections failed`,
        results: all,
      },
    });
  } else if (succeeded.length === context.connections.length) {
    dispatch("finalise", {
      status: "success",
      location: context.options.destination,
      size: context.getStatus().bytesToDownload,
      finalStatus: context.getStatus(),
    });
  } else if (cancelled.length + succeeded.length === context.connections.length) {
    dispatch("finalise", {
      status: "cancelled",
    });
  }
  return currentState;
};

export const connectionStateChangedHandler: ActionFunction<
  DownloadStates,
  DownloadActions,
  DownloadContext,
  "connection_state_changed"
> = ({ context, currentState, payload }) => {
  const { connectionIndex, state } = payload;
  context.connections[connectionIndex].stateSnapshot = state;
  // Infer the overall state from the connection states
  // Ignore completed states however as this needs to be handled by the connection_completed action
  const stateCounts = context.connections.reduce(
    (acc, { connection }) => {
      const state = connection.getState();
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    },
    {
      cancelling: 0,
      pausing: 0,
      downloading: 0,
      paused: 0,
      cancelled: 0,
      idle: 0,
      success: 0,
    } as Record<DownloadConnectionStates, number>
  );
  const totalConnections = context.connections.length;
  context.log("info", `Connection state counts`, stateCounts, `Total connections: ${totalConnections}`);
  if (stateCounts.cancelling) {
    return "cancelling";
  } else if (stateCounts.pausing) {
    return "pausing";
  } else if (stateCounts.downloading) {
    return "downloading";
  } else if (stateCounts.paused) {
    return stateCounts.paused + stateCounts.success === totalConnections ? "paused" : "pausing";
  } else if (stateCounts.cancelled) {
    return stateCounts.cancelled === totalConnections ? currentState : "cancelling";
  } else if (stateCounts.idle === totalConnections) {
    return "idle";
  }
  return currentState;
};

export const restartHandler: ActionFunction<DownloadStates, DownloadActions, DownloadContext, "restart"> = ({
  dispatch,
  context,
}) => {
  if (context.connections.length) {
    context.connections.forEach(({ connection }) => connection.cancel());
  } else {
    dispatch("initial_start");
  }
  return "restarting";
};

export const cancelHandler: ActionFunction<DownloadStates, DownloadActions, DownloadContext, "cancel"> = ({
  context,
}) => {
  context.connections.forEach(({ connection }) => connection.cancel());
  return "cancelling";
};
