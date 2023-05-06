import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { sendResponse } from "../utils.js";

export const makeUserRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();
  router.get("/", async (req: Request, res: Response) => {
    return sendResponse(res, await contentManager.db.getUserInfo());
  });
  return router;
};
