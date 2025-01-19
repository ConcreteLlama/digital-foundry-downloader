import { DfDownloaderConfig, DfDownloaderContainerConfig } from "df-downloader-common/config/df-downloader-config.js";
import { serviceInfo } from "../utils/service.js";
import z from "zod";

export const DfDownloaderServiceConfigSchema = serviceInfo.isContainer ? DfDownloaderContainerConfig : DfDownloaderConfig;
export type DfDownloaderServiceConfigSchema = z.infer<typeof DfDownloaderConfig>;