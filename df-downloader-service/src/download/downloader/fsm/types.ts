import { DownloadConnection } from "../../download-connection/download-connection.js";
import { DownloadConnectionResult, DownloadConnectionStates } from "../../download-connection/fsm/types.js";
import { DownloadResult } from "../download-result.js";

export type DownloadStates =
  | "idle"
  | "awaiting_retry"
  | "starting"
  | "connections_starting"
  | "downloading"
  | "pausing"
  | "paused"
  | "cancelling"
  | "cleaning_up"
  | "restarting"
  | "cancelled"
  | "success"
  | "failed";
export type DownloadActions = {
  start: undefined;
  initial_start: undefined;
  resume: undefined;
  start_connections: undefined;
  pause: undefined;
  restart: undefined;
  cancel: undefined;
  connection_completed: {
    connectionIndex: number;
    result: DownloadConnectionResult;
  };
  connection_state_changed: {
    connectionIndex: number;
    connection: DownloadConnection;
    state: DownloadConnectionStates;
  };
  cleanup: {
    finaliseWith?: DownloadResult;
  } | null;
  cleaned_up: {
    preCleanupState: DownloadStates;
  };
  finalise: DownloadResult;
  prepare_for_retry: undefined;
};
