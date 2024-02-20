import express from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager";
import { zodParseHttp } from "../utils/utils";
import { DfContentStatus, GenerateSubtitlesRequest, isDownloadedContentStatus } from "df-downloader-common";
import { sanitizeContentName } from "../../utils/df-utils";
import { getMediaType, mediaTypeToRegexMap } from "../../utils/media-type";

export const makeSubtitlesRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();

  router.post("/generate", async (req, res) => {
    await zodParseHttp(
      GenerateSubtitlesRequest,
      req,
      res,
      async ({ dfContentName, subtitlesService, mediaFilePath }) => {
        const contentName = sanitizeContentName(dfContentName);
        const content = await contentManager.db.getContentEntry(contentName);
        if (!content) {
          return res.status(404).send({
            message: "Content not found",
          });
        }
        const contentStatusInfo = content.statusInfo;
        if (!isDownloadedContentStatus(contentStatusInfo)) {
          return res.status(400).send({
            message: "Content not downloaded; cannot generate subtitles",
          });
        }
        // TODO: In the future we may have multiple download infos, which is why the API
        // request specifies it
        // I should extend the contentStatusInfo for downloaded media to instead includ a downloadInfo array
        // which also includes the relevant media info (video format/audio format) so we can just
        // falsey check the the video format; if it's not there we can't inject subs
        if (contentStatusInfo.downloadLocation !== mediaFilePath) {
          return res.status(400).send({
            message: "Content file path does not match",
          });
        }
        // For now let's just do a simple check for MP3 as that's currently the only
        // non video format we support
        if (getMediaType(contentStatusInfo.format) === "MP3") {
          return res.status(400).send({
            message: "Non-video files are not supporte",
          });
        }
      }
    );
  });
};
