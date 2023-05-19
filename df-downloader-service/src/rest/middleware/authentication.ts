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
