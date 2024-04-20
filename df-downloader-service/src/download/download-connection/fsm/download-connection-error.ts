import { ErrorReason } from "./types.js";

type DownloadConnectionErrorParams = {
  message: string;
  reason: ErrorReason;
  response?: Response;
  error?: any;
};

export class DownloadConnectionError extends Error {
  readonly reason: ErrorReason;
  readonly response?: Response;
  readonly error?: any;
  constructor({ message, reason, response, error }: DownloadConnectionErrorParams) {
    super(message);
    this.reason = reason;
    this.response = response;
    this.error = error;
  }
}
