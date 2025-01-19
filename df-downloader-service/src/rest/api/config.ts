import {
  DfDownloaderConfigKey,
  DfDownloaderConfigKeys
} from "df-downloader-common/config/df-downloader-config.js";
import express from "express";
import { DfDownloaderServiceConfigSchema } from "../../config/config-schema.js";
import { fromZodError } from "zod-validation-error";
import { configService } from "../../config/config.js";
import { sendError, sendResponse } from "../utils/utils.js";

export const makeConfigRouter = () => {
  const router = express.Router();
  router.get("/:field?", async (req, res) => {
    const field = req.params.field as DfDownloaderConfigKey | undefined;
    if (field && !DfDownloaderConfigKeys.includes(field)) {
      return sendError(res, `Field ${field} not found`, 404);
    }
    const config = configService.config;
    const toReturn = field ? config[field] : config;
    return sendResponse(res, toReturn || {});
  });
  router.put("/:field?", async (req, res) => {
    const field = req.params.field as DfDownloaderConfigKey | undefined;
    let parseConfig;
    if (field) {
      parseConfig = DfDownloaderServiceConfigSchema.shape[field].safeParse(req.body);
    } else {
      parseConfig = DfDownloaderServiceConfigSchema.partial().safeParse(req.body);
    }
    if (!parseConfig.success) {
      const error = fromZodError(parseConfig.error);
      return sendError(res, error.toString(), 400, error.details);
    }
    const toUpdate = field ? { [field]: parseConfig.data } : parseConfig.data;
    //TODO: Remove need for any
    const config = await configService.updateConfig(toUpdate as any);
    const toReturn = field ? config[field] : config;
    return sendResponse(res, toReturn || {});
  });
  return router;
};
