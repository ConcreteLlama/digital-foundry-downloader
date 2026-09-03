import { JellyfinListUsersRequest, JellyfinSignInRequest, TestMediaServerRequest } from "df-downloader-common";
import express, { Request, Response } from "express";
import { jellyfinListUsers, jellyfinSignIn } from "../../media-servers/jellyfin.js";
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

  /**
   * The Jellyfin accounts this API key can see, for the user picker.
   *
   * Takes the url and key from the form rather than from stored config, so
   * the picker works before anything has been saved - the same reason the
   * test endpoint does.
   */
  router.post("/jellyfin-users", async (req: Request, res: Response) => {
    zodParseHttp(JellyfinListUsersRequest, req, res, async ({ url, apiKey }) => {
      const result = await jellyfinListUsers(url, apiKey);
      return sendResponse(res, result.ok ? { ok: true, users: result.users } : { ok: false, error: result.error });
    });
  });

  /**
   * Trades a Jellyfin username and password for a user token.
   *
   * The password is used here and not stored - only the id and token it
   * returns get written to config, which the settings form then saves.
   */
  router.post("/jellyfin-sign-in", async (req: Request, res: Response) => {
    zodParseHttp(JellyfinSignInRequest, req, res, async ({ url, username, password }) => {
      const result = await jellyfinSignIn(url, username, password);
      return sendResponse(
        res,
        result.ok
          ? { ok: true, userId: result.userId, userToken: result.userToken, username: result.username }
          : { ok: false, error: result.error }
      );
    });
  });

  return router;
};
