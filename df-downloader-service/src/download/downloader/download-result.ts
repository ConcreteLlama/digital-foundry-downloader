import { DownloadContextStatus } from "./fsm/download-context.js";

export type CancelledDownloadResult = {
  status: "cancelled";
};
export const isCancelledDownloadResult = (result: DownloadResult): result is CancelledDownloadResult =>
  result.status === "cancelled";
export type FailedDownloadResult = {
  status: "failed";
  error: any;
};
export const isFailedDownloadResult = (result: DownloadResult): result is FailedDownloadResult =>
  result.status === "failed";
export type SuccessDownloadResult = {
  status: "success";
  location: string;
  size: number;
  finalStatus: DownloadContextStatus;
};
export const isSuccessDownloadResult = (result: DownloadResult): result is SuccessDownloadResult =>
  result.status === "success";
export type DownloadResult = CancelledDownloadResult | FailedDownloadResult | SuccessDownloadResult;
