import { LoggerType } from "../../../utils/log.js";
import { RetryOpts } from "../../../utils/retry-context.js";
import { DownloadUrl, UrlResolverFn, UrlResolverOpts } from "../../download-url.js";
import { DownloadConnectionError } from "./download-connection-error.js";

export type DownloadConnectionStates =
  | "idle"
  | "starting"
  | "downloading"
  | "pausing"
  | "paused"
  | "cancelling"
  | "awaiting_retry"
  | "completing"
  | "cancelled"
  | "success"
  | "failed";

export type ResumeMode = "resume" | "retry";
export type DownloadStartMode = "initial" | "resume" | "retry";
export type DownloadConnectionActions = {
  start: undefined;
  pause: undefined;
  cancel: undefined;
  initial_start: undefined;
  resume: ResumeMode;
  retry: "restart" | "resume";
  stream_finished: undefined;
  failed: DownloadConnectionError;
  cancelled: undefined;
  success: undefined;
};

export type CancelledDownloadConnectionResult = {
  status: "cancelled";
};
export const isCancelledDownloadConnectionResult = (
  result: DownloadConnectionResult
): result is CancelledDownloadConnectionResult => result.status === "cancelled";
export type FailedDownloadConnectionResult = {
  status: "failed";
  details: DownloadConnectionError;
};
export const isFailedDownloadConnectionResult = (
  result: DownloadConnectionResult
): result is FailedDownloadConnectionResult => result.status === "failed";
export type SuccessDownloadConnectionResult = {
  status: "success";
};
export const isSuccessDownloadConnectionResult = (
  result: DownloadConnectionResult
): result is SuccessDownloadConnectionResult => result.status === "success";
export type DownloadConnectionResult =
  | CancelledDownloadConnectionResult
  | FailedDownloadConnectionResult
  | SuccessDownloadConnectionResult;

export type RangeOpt = {
  start: number;
  end?: number | null;
};

export type DownloadConnectionOptions = {
  url: DownloadUrl;
  destination: string;
  resolverOpts?: UrlResolverOpts;
  headers: Headers;
  label: string;
  createFileIfNotExists?: boolean;
  logger?: LoggerType;
  range: RangeOpt | null;
  retryOpts?: RetryOpts;
};

export const ErrorReasons = [
  "file_not_writable",
  "initial_fetch_failed",
  "bad_fetch_response",
  "stream_error",
  "url_resolve_failed",
  "unknown",
] as const;
export type ErrorReason = (typeof ErrorReasons)[number];

export type DownloadCapabilities = {
  supportsByteRangeHeaders: boolean;
};
