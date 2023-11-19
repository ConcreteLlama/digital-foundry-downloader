import {
  DfContentEntrySearchBody,
  DfContentEntrySearchUtils,
  DfContentEntryUtils,
  DfContentInfoRefreshMetaRequest,
  DfContentInfoRefreshMetaResponse,
  DfContentQueryResponse,
  DfContentStatus,
  DfTagsResponse,
  secondsToHHMMSS,
} from "df-downloader-common";
import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { sanitizeContentName } from "../../utils/df-utils.js";
import { queryParamToInteger, queryParamToString, queryParamToStringArray } from "../../utils/query-utils.js";
import { sendResponse, zodParseHttp } from "../utils/utils.js";

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

  return router;
};
