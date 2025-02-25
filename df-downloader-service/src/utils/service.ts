import { ServiceInfo } from "df-downloader-common";
import { CURRENT_BRANCH, CURRENT_VERSION } from "../version.js";

const isContainer = (process.env.CONTAINER_ENV?.length || 0) > 0;

export const serviceInfo: ServiceInfo = {
   name: "df-downloader-service",
   version: CURRENT_VERSION,
   branch: CURRENT_BRANCH,
   isContainer,
 };