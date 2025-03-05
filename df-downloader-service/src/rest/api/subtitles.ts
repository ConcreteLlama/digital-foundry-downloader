import { DfContentEntryUtils, GenerateSubtitlesRequest } from "df-downloader-common";
import express from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { serviceLocator } from "../../services/service-locator.js";
import { sanitizeContentName } from "../../utils/df-utils.js";
import { zodParseHttp } from "../utils/utils.js";
import { ServiceContentUtils } from "../../utils/service-content-utils.js";

export const makeSubtitlesRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();

  router.post("/generate", async (req, res) => {
    await zodParseHttp(
      GenerateSubtitlesRequest,
      req,
      res,
      async ({ dfContentName, subtitlesService, mediaFilePath, language }) => {
        const contentName = sanitizeContentName(dfContentName);
        const content = await contentManager.db.getContentEntry(contentName);
        if (!content) {
          return res.status(404).send({
            message: "Content not found",
          });
        }
        const contentStatusInfo = content.statusInfo;
        if (!DfContentEntryUtils.hasDownload(content)) {
          return res.status(400).send({
            message: "Content not downloaded; cannot generate subtitles",
          });
        }
        const downloadInfo = ServiceContentUtils.getDownloadByLocation(content, mediaFilePath);
        if (!downloadInfo) {
          return res.status(404).send({
            message: `Could not find download info for "${contentName}" in "${mediaFilePath}"`,
          });
        }
        const mediaInfo = downloadInfo.mediaInfo;
        if (mediaInfo.type !== "VIDEO") {
          return res.status(400).send({
            message: `Requested content at file "${mediaFilePath}" is format "${mediaInfo.formatString}" which is not supported for subtitle generation`,
          });
        }
        const subtitleGenerators = subtitlesService
          ? serviceLocator.getSubtitleGenerator(subtitlesService)
          : serviceLocator.getSubtitleGenerators();
        if (!subtitleGenerators) {
          return res.status(400).send({
            message: `No subtitle generators available for service "${subtitlesService}"`,
          });
        }
        const subsTask = contentManager.taskManager.generateSubs(
          content.contentInfo,
          mediaInfo!,
          mediaFilePath,
          language,
          subtitleGenerators
        );
        subsTask.on("completed", (result) => {
          if (result.status === "success") {
            const { language, service } = result.pipelineResult;
            contentManager.db.subsGenerated(contentName, mediaFilePath, {
              language,
              service,
            });
          }
        });

        res.status(200).send({
          message: "Subtitles generation started",
        });
      }
    );
  });
  return router;
};
