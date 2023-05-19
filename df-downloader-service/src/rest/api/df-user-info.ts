import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { sendError, sendResponse, zodParseHttp } from "../utils/utils.js";
import { getDfUserInfo } from "../../df-fetcher.js";
import { TestSessionIdRequest } from "df-downloader-common";
import { queryParamToInteger } from "../../utils/query-utils.js";

export const makeDfUserInfoRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();
  router.get("/", async (req: Request, res: Response) => {
    return sendResponse(res, await contentManager.db.getDfUserInfo());
  });
  router.post("/test-session-id", async (req: Request, res: Response) => {
    zodParseHttp(TestSessionIdRequest, req, res, async (testSessionIdRequest) => {
      const dfUser = await getDfUserInfo(testSessionIdRequest.sessionId);
      return dfUser ? sendResponse(res, dfUser) : sendError(res, "Invalid session ID", 200);
    });
  });
  router.get("/await-login", async (req: Request, res: Response) => {
    const timeout = queryParamToInteger(req.query.timeout) || 10000;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const dfUser = await contentManager.db.getDfUserInfo();
      if (dfUser) {
        return sendResponse(res, dfUser);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return sendError(res, "Timed out waiting for login", 200);
  });
  return router;
};
