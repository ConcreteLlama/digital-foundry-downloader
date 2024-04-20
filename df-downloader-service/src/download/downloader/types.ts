import { LoggerType } from "../../utils/log.js";
import { RetryOpts } from "../../utils/retry-context.js";
import { DownloadUrlOpt, UrlResolverOpts } from "../download-url.js";
import { DownloadContextStatus } from "./fsm/download-context.js";
import { DownloadStates } from "./fsm/types.js";

export type ConnectionResolverOpts = {
  resolvePerConnection?: boolean;
} & UrlResolverOpts;

export type DownloadOptions = {
  url: DownloadUrlOpt;
  destination: string;
  resolveOptions?: UrlResolverOpts;
  connectionResolveOpts?: ConnectionResolverOpts;
  headers?: HeadersInit;
  retries: RetryOpts;
  connectionRetries: RetryOpts;
  maxConnections: number;
  logger?: LoggerType;
  label?: string;
};

export type DownloadStatus = DownloadContextStatus & {
  state: DownloadStates;
};
