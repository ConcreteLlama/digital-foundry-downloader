import express from "express";
import cors from "cors";
import { DigitalFoundryContentManager } from "../df-content-manager.js";
import { makeApiRouter } from "./api.js";
import { configService } from "../config/config.js";
import { createExpressServer } from "../utils/http.js";
import { makeWebRouter } from "./web.js";

export function makeRoutes(contentManager: DigitalFoundryContentManager) {
  const restConfig = configService.config.restApi;
  const app = createExpressServer(restConfig);
  app.use(
    cors({
      origin: "*",
    })
  );

  app.use("/api", makeApiRouter(contentManager));
  const webRouter = makeWebRouter();
  webRouter && app.use(webRouter);
}
