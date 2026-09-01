import { TestMediaServerRequest } from "df-downloader-common";
import express, { Request, Response } from "express";
import { serviceLocator } from "../../services/service-locator.js";
import { sendResponse, zodParseHttp } from "../utils/utils.js";

export const makeMediaServersRouter = () => {
  const router = express.Router();

  /**
   * Checks one server's settings without saving them.
   *
   * A failure here is a successful request reporting a failed test, not an
   * HTTP error - the caller is a settings form asking a question, and "your
   * token is wrong" is an answer rather than a fault. Same shape as the DF
   * session test for that reason.
   */
  router.post("/test", async (req: Request, res: Response) => {
    zodParseHttp(TestMediaServerRequest, req, res, async (request) => {
      const result = await serviceLocator.mediaServers.testConnection(request);
      return sendResponse(
        res,
        result.ok
          ? { ok: true, detail: result.detail, libraries: result.libraries }
          : { ok: false, error: result.error }
      );
    });
  });

  return router;
};
