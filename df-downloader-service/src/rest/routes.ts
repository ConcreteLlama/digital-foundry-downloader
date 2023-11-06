import express from "express";
import cors from "cors";
import { DigitalFoundryContentManager } from "../df-content-manager.js";
import { makeApiRouter } from "./api.js";
import { configService } from "../config/config.js";
import { createExpressServer } from "../utils/http.js";
import { makeWebRouter } from "./web.js";
import { JwtManager } from "./auth/jwt.js";
import cookieParser from "cookie-parser";
import { getAllowOrigin, getPublicAddresses } from "./utils/utils.js";
import { logger } from "df-downloader-common";

export const makeRoutes = async (contentManager: DigitalFoundryContentManager, jwtManager: JwtManager) => {
  const restConfig = configService.config.restApi;
  const publicAddress = getPublicAddresses();
  const primaryPublicAddress = publicAddress[0];
  const app = await createExpressServer(restConfig, primaryPublicAddress);
  const allowedOrigins = getAllowOrigin(publicAddress);
  logger.log("info", `Allowing origins: ${allowedOrigins === true ? "Reflected" : allowedOrigins}`);
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use("/api", makeApiRouter(contentManager, jwtManager));
  const webRouter = makeWebRouter(primaryPublicAddress);
  webRouter && app.use(webRouter);
};
