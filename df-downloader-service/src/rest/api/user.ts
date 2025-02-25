import { UpdateUserInfoRequest, UpdateUserInfoResponse } from "df-downloader-common";
import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { userService } from "../../users/users.js";
import { sendResponse, zodParseHttp } from "../utils/utils.js";

export const makeUserRouter = (_contentManager: DigitalFoundryContentManager) => {
    const router = express.Router();
    router.patch("/", async (req: Request, res: Response) => {
        await zodParseHttp(UpdateUserInfoRequest, req, res, async (data) => {
            const user = await userService.updateUserInfo(data.userId, data.userInfo);
            const response: UpdateUserInfoResponse = {
                userId: user.id,
                updatedUserInfo: user.userInfo,
            }
            return sendResponse(res, response);
        });
    });
    return router;
};
