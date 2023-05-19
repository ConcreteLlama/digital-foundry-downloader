import { AuthErrorResponseData, AuthErrorResponseReason, User, makeErrorResponse } from "df-downloader-common";
import express from "express";
import { z } from "zod";
import { userService } from "../../users/users.js";
import { sendResponseWithData } from "./utils.js";

export const sendAuthErrorResponse = (res: express.Response, reason: AuthErrorResponseReason) => {
  const data: AuthErrorResponseData = {
    reason,
    registrationAvailable: !userService.hasUsers(),
  };
  return sendResponseWithData(res, makeErrorResponse("Unauthorized", 401, data), {
    code: 401,
  });
};

export interface AuthenticationRequest extends express.Request {
  userAuthorization?: {
    username: string;
    password: string;
  };
}
export interface AuthenticatedRequest extends express.Request {
  user?: User;
  authorizationError?: any;
}

export const JwtData = z.object({
  user: User,
});
export type JwtData = z.infer<typeof JwtData>;

export const extractUsernamePassword = (authHeader: string) => {
  const [username, password] = Buffer.from(authHeader.split(" ")[1], "base64").toString("utf-8").split(":");
  return { username, password };
};
