import express from "express";
import { CURRENT_VERSION } from "../../version.js";
import { sendResponse } from "../utils/utils.js";
import { ServiceInfo } from "df-downloader-common";

const isContainer = (process.env.CONTAINER_ENV?.length || 0) > 0;
const serviceInfo: ServiceInfo = {
  name: "df-downloader-service",
  version: CURRENT_VERSION,
  isContainer,
};

export const makeServiceInfoRouter = () => {
  const router = express.Router();
  router.get("/", async (req, res) => {
    return sendResponse(res, serviceInfo);
  });
  return router;
};
