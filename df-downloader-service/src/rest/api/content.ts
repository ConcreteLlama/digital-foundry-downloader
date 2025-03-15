import {
  ContentMoveFileInfo,
  DeleteDownloadRequest,
  DfContentEntrySearchBody,
  DfContentEntrySearchUtils,
  DfContentEntryUtils,
  DfContentInfoRefreshMetaRequest,
  DfContentInfoRefreshMetaResponse,
  DfContentQueryResponse,
  DfContentAvailability,
  DfTagsResponse,
  DummyContentInfos,
  isMoveFilesWithListRequest,
  MoveFilesRequest,
  PreviewMoveRequest,
  PreviewMoveResponse,
  secondsToHHMMSS,
  DfContentUpdateDownloadMetaRequest,
  DfContentUpdateDownloadMetaResponse
} from "df-downloader-common";
import { testTemplate } from "df-downloader-common/utils/filename-template-utils.js";
import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { sanitizeContentName } from "../../utils/df-utils.js";
import { queryParamToInteger, queryParamToString, queryParamToStringArray } from "../../utils/query-utils.js";
import { sendErrorAsResponse, sendResponse, zodParseHttp } from "../utils/utils.js";
import { ServiceContentUtils } from "../../utils/service-content-utils.js";
import { configService } from "../../config/config.js";

export const makeContentApiRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();

  router.get("/entry/:id", async (req: Request, res: Response) => {
    let contentName: string = req.params.id;
    if (!contentName) {
      return res.status(400).send({
        message: "Must supply content name",
      });
    }
    contentName = sanitizeContentName(contentName);
    const contentInfo = await contentManager.db.getContentEntry(contentName);
    if (!contentInfo) {
      return res.status(404).send();
    }
    return sendResponse(res, contentInfo);
  });

  router.post("/entry/refresh-metadata", async (req: Request, res: Response) => {
    await zodParseHttp(DfContentInfoRefreshMetaRequest, req, res, async (body) => {
      const contentNames = body.contentName.map((name) => sanitizeContentName(name));
      const result = await contentManager.refreshMeta(...contentNames);
      const response: DfContentInfoRefreshMetaResponse = {
        contentEntries: result,
      };
      return sendResponse(res, response);
    });
  });

  router.post("/downloads/update-metadata", async (req: Request, res: Response) => {
    await zodParseHttp(
      DfContentUpdateDownloadMetaRequest, req, res, async (body) => {
        const contentEntry = await contentManager.db.getContentEntry(body.contentName);
        if (!contentEntry) {
          return res.status(404).send({
            message: "Content not found",
          });
        }
        const pipeline = contentManager.taskManager.updateDownloadMetadata(
          contentEntry.contentInfo,
          body.filename,
        );
        const response: DfContentUpdateDownloadMetaResponse = {
          contentName: body.contentName,
          filename: body.filename,
          pipelineId: pipeline.id,
        };
        return sendResponse(res, response);
      });
  });

  // TODO: Add one to extract meta from existing file
  // TODO: Add one to fetch meta for content + return

  router.get("/query", async (req: Request, res: Response) => {
    const query = req.query;
    const limit = queryParamToInteger(query.limit);
    const page = queryParamToInteger(query.page);
    const availability = queryParamToStringArray(query.availability)?.map(
      (value) => DfContentAvailability[value as keyof typeof DfContentAvailability]
    );
    const tags = queryParamToStringArray(query.tags);
    const search = queryParamToString(query.search);
    const tagMode = (queryParamToString(query.tagMode) || "or").toLowerCase() === "and" ? "and" : "or";
    const result = await contentManager.db.query({
      page,
      limit,
      availability,
      tags,
      search,
      tagMode,
    });
    const response: DfContentQueryResponse = {
      params: result.params,
      resultsOnPage: result.queryResult.length,
      pageDuration: secondsToHHMMSS(DfContentEntryUtils.getTotalDuration(result.queryResult)),
      totalResults: result.totalResults,
      totalDuration: secondsToHHMMSS(result.totalDurationSeconds),
      content: result.queryResult,
      scanInProgress: contentManager.scanInProgress,
    };
    sendResponse(res, response);
  });

  router.post("/search", async (req: Request, res: Response) => {
    await zodParseHttp(DfContentEntrySearchBody, req, res, async (searchProps) => {
      const allContentEntries = await contentManager.db.getAllContentEntries();
      const result = DfContentEntrySearchUtils.search(searchProps, allContentEntries);
      result.scanInProgress = contentManager.scanInProgress;
      return sendResponse(res, result);
    });
  });

  router.get("/tags", async (req: Request, res: Response) => {
    const responseData: DfTagsResponse = {
      tags: await contentManager.db.getAllTags(),
    };
    return sendResponse(res, responseData);
  });

  router.post("/delete-download", async (req: Request, res: Response) => {
    await zodParseHttp(DeleteDownloadRequest, req, res, async (searchProps) => {
      const contentEntry = await contentManager.db.getContentEntry(searchProps.contentName);
      if (!contentEntry) {
        return res.status(404).send({
          message: "Content not found",
        });
      }
      const downloadInfo = ServiceContentUtils.getDownloadByLocation(contentEntry, searchProps.downloadLocation);
      if (!downloadInfo) {
        return res.status(404).send({
          message: `Download not found for content ${searchProps.contentName}`,
        });
      }
      await contentManager.deleteDownload(contentEntry, downloadInfo.downloadLocation);
      return sendResponse(res, {
        message: `Download deleted for ${searchProps.contentName} at ${searchProps.downloadLocation}`,
      });
    });
  });

  router.post("/preview-move", async (req: Request, res: Response) => {
    await zodParseHttp(PreviewMoveRequest, req, res, async (body) => {
      const contentEntries = await contentManager.db.getAllContentEntries();
      try {
        testTemplate(body.templateString, DummyContentInfos[0]);
      } catch (e) {
        return sendErrorAsResponse(res, e);
      }
      const moveFileList = await contentManager.getFileMoveList(body.templateString);
      const results: PreviewMoveResponse = {
        templateString: body.templateString,
        results: moveFileList,
      }
      return sendResponse(res, results);
    });
  });

  router.post("/move-files", async (req: Request, res: Response) => {
    await zodParseHttp(MoveFilesRequest, req, res, async (body) => {
      const toMove: ContentMoveFileInfo[] = isMoveFilesWithListRequest(body) ? body.toMove : await contentManager.getFileMoveList(body.template)
      const taskInfo = contentManager.taskManager.batchMoveFiles(toMove, body.overwrite, body.removeRecordIfMissing);
      res.status(200).send({
        message: "Batch move files request initiated",
        taskId: taskInfo.task.id,
      });
    });
  });

  router.post("/clear-missing-files", async (req: Request, res: Response) => {
    const task = contentManager.taskManager.clearMissingFiles();
    return sendResponse(res, {
      message: "Clear missing files task initiated",
      taskId: task.task.id,
    });
  });

  router.post("/scan-for-existing-content", async (req: Request, res: Response) => {
    const task = contentManager.taskManager.scanForExistingContent(contentManager);
    return sendResponse(res, {
      message: "Scan for existing content task initiated",
      taskId: task.task.id,
    });
  });
  
  router.post("/remove-empty-dirs", async (req: Request, res: Response) => {
    const task = contentManager.taskManager.removeEmptyDirs(configService.config.contentManagement.destinationDir);
    return sendResponse(res, {
      message: "Remove empty directories task initiated",
      taskId: task.task.id,
    });
  });

  return router;
};
