import bcrypt from "bcrypt";
import {
  BasicUserIdRequest,
  ChangePasswordRequest,
  ExpiryCache,
  User,
  UserInfo,
  UserUtils,
  ValidateResetTokenRequest,
  ValidateResetTokenResponse,
} from "df-downloader-common";
import express from "express";
import { userService } from "../../users/users.js";
import { JwtManager } from "../auth/jwt.js";
import { authenticateMiddleware, extractBasicAuthMiddleware } from "../middleware/authentication.js";
import { AuthenticatedRequest, AuthenticationRequest } from "../utils/auth.js";
import { isRestSecure, sendError, sendResponse, zodParseHttp } from "../utils/utils.js";
import { generateSecretAsync } from "../auth/utils.js";
import { configService } from "../../config/config.js";
import { serviceLocator } from "../../services/service-locator.js";

export const makeAuthRouter = (jwtManager: JwtManager) => {
  const router = express.Router();
  const passwordResetTokenStore = new ExpiryCache<string>();

  const logout = async (res: express.Response, accessToken: string) => {
    jwtManager.invalidateToken(accessToken);
    return sendResponse(
      res,
      {},
      {
        cookies: [
          {
            name: "x-access-token",
            value: "",
          },
        ],
      }
    );
  };

  router.post("/logout", (req, res) => {
    const accessToken = req.cookies["x-access-token"];
    if (!accessToken) {
      return res.status(401).send();
    }
    logout(res, accessToken);
  });

  router.post("/login", extractBasicAuthMiddleware, async (req: AuthenticationRequest, res) => {
    const { username, password } = req.userAuthorization!;
    const user = userService.getUser(username);
    if (!user) {
      return res.status(401).send();
    }
    const passwordMatch = await bcrypt.compare(password, user.authentication.secretHash);
    if (!passwordMatch) {
      return res.status(401).send();
    }
    const jwtUserData: User = UserUtils.toUser(user);
    const token = jwtManager.generateJwt({
      user: jwtUserData,
    });

    return sendResponse(res, jwtUserData, {
      cookies: [
        {
          name: "x-access-token",
          value: token,
          options: {
            httpOnly: true,
            sameSite: "strict",
            secure: isRestSecure(),
          },
        },
      ],
    });
  });

  router.get("/users/:id", authenticateMiddleware(jwtManager), (req: AuthenticatedRequest, res) => {
    const userId = req.params.id;
    if (userId === "me" || userId === req.user?.id) {
      return sendResponse(res, req.user);
    }
    //not implemented

    return res.status(501).send();
  });

  router.post("/reset-password", async (req: AuthenticatedRequest, res) => {
    zodParseHttp(BasicUserIdRequest, req, res, async (basicUserIdRequest) => {
      const { id } = basicUserIdRequest;
      if (!id) {
        return sendError(res, "No user id provided", 400);
      }
      const user = userService.getUser(id);
      if (user) {
        const existingResetTokenEntry = passwordResetTokenStore.getEntry(id);
        let resetToken: string, expiryTime: number;
        if (existingResetTokenEntry) {
          resetToken = existingResetTokenEntry.value;
          expiryTime = existingResetTokenEntry.expiryTime;
        } else {
          resetToken = await generateSecretAsync(32);
          expiryTime = passwordResetTokenStore.setExpireIn(
            id,
            resetToken,
            configService.config.authentication.passwordReset.resetTokenValidity
          );
        }
        const authUrl = `${req.headers.origin}/auth?resetToken=${resetToken}&username=${id}`;
        serviceLocator.notifier.passwordReset(resetToken, authUrl, new Date(expiryTime));
      }
      return res.status(200).send();
    });
  });

  router.post("/validate-reset-token", async (req, res) => {
    zodParseHttp(ValidateResetTokenRequest, req, res, async (validateResetTokenRequest) => {
      const { resetToken, userId } = validateResetTokenRequest;
      const storedToken = passwordResetTokenStore.get(userId);
      let valid = false;
      if (storedToken && storedToken === resetToken) {
        valid = true;
      }
      const validateResponseBody: ValidateResetTokenResponse = {
        valid,
      };
      return sendResponse(res, validateResponseBody);
    });
  });

  router.post(
    "/change-password",
    authenticateMiddleware(jwtManager, {
      noReject: true,
    }),
    (req: AuthenticatedRequest, res) => {
      zodParseHttp(ChangePasswordRequest, req, res, async (changePasswordRequest) => {
        const { oldPassword, newPassword, resetToken, userId: reqUserId } = changePasswordRequest;
        const userId = oldPassword ? req.user?.id : reqUserId;
        if (!userId) {
          return res.status(oldPassword ? 401 : 400).send();
        }
        const user = userService.getUser(userId);
        if (!user) {
          return res.status(401).send();
        }
        if (oldPassword) {
          const passwordMatch = await bcrypt.compare(oldPassword, user.authentication.secretHash);
          if (!passwordMatch) {
            return res.status(401).send();
          }
        } else if (resetToken) {
          const storedToken = passwordResetTokenStore.get(userId);
          if (!storedToken || storedToken !== resetToken) {
            return res.status(401).send();
          }
          passwordResetTokenStore.delete(userId);
        } else {
          return res.status(400).send();
        }
        const passwordHash = await bcrypt.hash(newPassword, 10);
        const userEntity = await userService.updateUser(userId, {
          authentication: {
            secretHash: passwordHash,
          },
        });
        if (req.cookies["x-access-token"]) {
          return logout(res, req.headers["x-access-token"] as string);
        }
        return sendResponse(res, UserUtils.toUser(userEntity));
      });
    }
  );

  router.get("/can-register", (req, res) => {
    return sendResponse(res, {
      canRegister: !userService.hasUsers(),
    });
  });

  router.post("/register", extractBasicAuthMiddleware, async (req: AuthenticationRequest, res) => {
    //TODO: Check to see if they have a token and are an admin, if so go ahead
    if (userService.hasUsers()) {
      return res.status(401).send();
    }
    const { username: id, password } = req.userAuthorization!;
    await zodParseHttp(UserInfo, req, res, async (userInfo) => {
      const passwordHash = await bcrypt.hash(password, 10);
      const authorization = {
        role: "admin",
      };
      await userService.createUser({
        id,
        userInfo,
        authorization: {
          role: "admin",
        },
        authentication: {
          secretHash: passwordHash,
        },
      });
      return sendResponse(res, {
        id,
        userInfo,
        authorization,
      });
    });
  });

  return router;
};
