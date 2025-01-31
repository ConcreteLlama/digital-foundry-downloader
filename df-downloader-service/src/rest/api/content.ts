import {
  DeleteDownloadRequest,
  DfContentEntrySearchBody,
  DfContentEntrySearchUtils,
  DfContentEntryUtils,
  DfContentInfoRefreshMetaRequest,
  DfContentInfoRefreshMetaResponse,
  DfContentInfoUtils,
  DfContentQueryResponse,
  DfContentStatus,
  DfTagsResponse,
  secondsToHHMMSS,
  TestTemplateRequest,
  TestTemplateResponse,
} from "df-downloader-common";
import { testTemplate } from "df-downloader-common/utils/filename-template-utils.js";
import express, { Request, Response } from "express";
import path from "path";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { sanitizeContentName } from "../../utils/df-utils.js";
import { queryParamToInteger, queryParamToString, queryParamToStringArray } from "../../utils/query-utils.js";
import { makeFilePathWithTemplate } from "../../utils/template-utils.js";
import { sendErrorAsResponse, sendResponse, zodParseHttp } from "../utils/utils.js";

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

  router.get("/query", async (req: Request, res: Response) => {
    const query = req.query;
    const limit = queryParamToInteger(query.limit);
    const page = queryParamToInteger(query.page);
    const status = queryParamToStringArray(query.status)?.map(
      (value) => DfContentStatus[value as keyof typeof DfContentStatus]
    );
    const tags = queryParamToStringArray(query.tags);
    const search = queryParamToString(query.search);
    const tagMode = (queryParamToString(query.tagMode) || "or").toLowerCase() === "and" ? "and" : "or";
    const result = await contentManager.db.query({
      page,
      limit,
      status,
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
      const downloadInfo = DfContentEntryUtils.getDownload(contentEntry, searchProps.downloadLocation);
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
    await zodParseHttp(TestTemplateRequest, req, res, async (body) => {
      const contentEntries = await contentManager.db.getAllContentEntries();
      try {
        testTemplate(body.templateString);
      } catch (e) {
        return sendErrorAsResponse(res, e);
      }
      // TODO: Move this into its own utility fn so we can reuse it for actual move task
      const results: TestTemplateResponse = {
        templateString: body.templateString,
        results: contentEntries.reduce((acc, {contentInfo, downloads}) => {
          if (!downloads.length) {
            return acc;
          }
          const files = downloads.reduce((acc, download) => {
            const mediaInfo = DfContentInfoUtils.getMediaInfo(contentInfo, download.format);
            if (mediaInfo) {
              const oldFilename = path.normalize(download.downloadLocation);
              const newFilename = path.normalize(makeFilePathWithTemplate(contentInfo, mediaInfo, body.templateString));
              if (oldFilename !== newFilename) {
                acc.push({
                  oldFilename: oldFilename,
                  newFilename: newFilename,
                });     
              }       
            }
            return acc;
          }, [] as TestTemplateResponse['results']['0']['files'])
          if (files.length) {
            acc.push({
              contentName: contentInfo.name,
              files,
            });
          }
          return acc;
        }, [] as TestTemplateResponse['results'])
      }
      return sendResponse(res, {
        templateString: body.templateString,
        results,
      });
    });
  });

  return router;
};
