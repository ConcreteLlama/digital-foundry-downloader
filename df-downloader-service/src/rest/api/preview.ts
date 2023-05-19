import express from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { sendResponse } from "../utils/utils.js";
import { PreviewThumbnailResponse } from "df-downloader-common";

export const makePreviewRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();
  router.get("/thumbs", async (req, res) => {
    const content = await contentManager.db.getAllContentEntries();
    // Select 20 random entries
    const randomContent = content
      .filter((content) => content.contentInfo.thumbnailUrl)
      .sort(() => Math.random() - Math.random())
      .slice(0, 20);
    const thumbs = randomContent.map((c) => c.contentInfo.thumbnailUrl!);
    const thumbResponse: PreviewThumbnailResponse = {
      thumnails: thumbs,
    };
    return sendResponse(res, thumbResponse);
  });
  return router;
};
