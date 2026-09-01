import { User, logger } from "df-downloader-common";
import express from "express";
import jsonwebtoken from "jsonwebtoken";
import { fromZodError } from "zod-validation-error";
import { JwtManager } from "../auth/jwt.js";
import {
  AuthenticatedRequest,
  AuthenticationRequest,
  JwtData,
  extractUsernamePassword,
  sendAuthErrorResponse,
} from "../utils/auth.js";

/**
 * A development-only escape from authentication.
 *
 * Exists so a throwaway instance can be driven end to end - by a script, a
 * test, or an agent working on this repo - without a real account. It treats
 * every request as an admin.
 *
 * **Environment variable rather than a config setting, deliberately.**
 * `config.yaml` gets copied between machines, pasted into issues and mounted
 * into containers; a bypass living there would eventually travel somewhere it
 * was never meant to go and stay switched on silently. An env var has to be
 * set for that specific process, and disappears when it stops.
 *
 * It announces itself at startup and on every request it lets through, because
 * the failure mode worth designing against is not switching it on - it is
 * forgetting it is on.
 */
const AUTH_BYPASS_ENABLED = process.env.DF_AUTH_BYPASS === "1";

const BYPASS_USER: User = {
  id: "dev-auth-bypass",
  userInfo: {},
  authorization: { role: "admin" },
};

if (AUTH_BYPASS_ENABLED) {
  logger.log(
    "warn",
    "DF_AUTH_BYPASS is set: every API request is treated as an admin, with no login. This is for local development only - never set it on an instance anything else can reach."
  );
}

export const extractBasicAuthMiddleware = (
  req: AuthenticationRequest,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).send("No authorization header");
  }
  const { username, password } = extractUsernamePassword(authHeader);
  if (!username || !password) {
    return res.status(401).send("Invalid authorization header");
  }
  req.userAuthorization = {
    username,
    password,
  };
  next();
};

type AuthenticateMiddlewareOpts = {
  noReject?: boolean;
};
export const authenticateMiddleware =
  (jwtManager: JwtManager, opts: AuthenticateMiddlewareOpts = {}) =>
  (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    if (AUTH_BYPASS_ENABLED) {
      // Logged per request rather than once: a bypass that goes quiet is one
      // nobody notices is still on.
      logger.log("warn", `Auth bypassed for ${req.method} ${req.originalUrl} (DF_AUTH_BYPASS)`);
      req.user = BYPASS_USER;
      return next();
    }
    const accessToken = req.cookies["x-access-token"];
    if (!accessToken) {
      if (opts.noReject) {
        req.authorizationError = "no-token";
        return next();
      }
      return sendAuthErrorResponse(res, "no-token");
    }
    let jwtData;
    try {
      jwtData = jwtManager.verifyJwt<JwtData>(accessToken);
    } catch (e: any) {
      const error = e instanceof jsonwebtoken.TokenExpiredError ? "token-expired" : e;
      if (opts.noReject) {
        req.authorizationError = error;
        return next();
      }
      logger.log("verbose", "Error verifying JWT", e?.message ? e.message : e);
      if (e instanceof jsonwebtoken.TokenExpiredError) {
        return sendAuthErrorResponse(res, "token-expired");
      }
    }
    if (!jwtData) {
      if (opts.noReject) {
        req.authorizationError = "invalid-token";
        return next();
      }
      return sendAuthErrorResponse(res, "invalid-token");
    }
    const userRaw = jwtData.user;
    try {
      const user = User.parse(userRaw);
      req.user = user;
      next();
    } catch (e: any) {
      logger.log("error", "Error parsing user from JWT", fromZodError(e).toString());
      return sendAuthErrorResponse(res, "invalid-token");
    }
  };
