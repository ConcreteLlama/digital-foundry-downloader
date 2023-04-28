import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../df-content-manager.js";
import { QueueDownloadRequest, zodParse } from "df-downloader-common";
import { sendError, sendErrorAsResponse, sendResponse, zodParseHttp } from "./utils.js";

export const makeDownloadsApiRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();

  router.get("/queue", async (req: Request, res: Response) => {
    const queuedContent = contentManager.queuedContent;
    return sendResponse(res, Array.from(queuedContent.values()));
  });

  router.post("/queue", async (req: Request, res: Response) => {
    await zodParseHttp(QueueDownloadRequest, req, res, async (data) => {
      try {
        const queuedContentInfo = await contentManager.getContent(data.name, {
          mediaType: data.mediaType,
        });
        sendResponse(res, queuedContentInfo);
      } catch (e) {
        sendErrorAsResponse(res, e, 500);
      }
    });
  });

  // router.post("/downloadContent", async (req: Request, res: Response) => {
  //   let contentName: string = req.body.contentName;
  //   if (!contentName) {
  //     return res.status(400).send({
  //       message: "Must supply content name",
  //     });
  //   }
  //   contentName = sanitizeContentName(contentName);
  //   logger.log(LogLevel.INFO, `downloadContent ${req.body.contentName} - ${contentName}`);
  //   try {
  //     const contentInfo = await contentManager.getContent(contentName);
  //     return res.send(contentInfo);
  //   } catch (e) {
  //     return res.status(500).send(e);
  //   }
  // });
  return router;
};
