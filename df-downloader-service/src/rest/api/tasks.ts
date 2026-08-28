import { AddTaskRequest, ControlRequest, DownloadContentResponse, ManualDownloadRequest, TasksResponse, DfContentAvailability, getBestMediaInfoMatch, mapFilterEmpty } from "df-downloader-common";
import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { makeTaskPipelineInfo, makeTaskPipelineInfoFromPersisted } from "../../df-task-manager.js";
import { serviceLocator } from "../../services/service-locator.js";
import { sendErrorAsResponse, sendResponse, zodParseHttp } from "../utils/utils.js";
import { configService } from "../../config/config.js";

export const makeDownloadsApiRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();
  const taskManager = contentManager.taskManager;

  /**
   * How many finished pipelines from previous runs to include.
   *
   * The full history is capped far higher on disk, but this response is
   * polled, and each entry carries its content info - returning hundreds
   * would mean megabytes on every poll for history nobody is scrolling
   * that far back through.
   */
  const HISTORY_LIMIT = 50;

  router.get("/list", async (req: Request, res: Response) => {
    const taskPipelines = taskManager.getAllPipelineInfos();
    const tasks = taskManager.getAllTaskInfos();
    // Finished pipelines only live in memory, so a restart used to empty the
    // completed list entirely. Top them up from the persisted history,
    // skipping any the running process already knows about.
    const liveIds = new Set(taskPipelines.map((pipeline) => pipeline.id));
    const history = (serviceLocator.completedPipelineDb?.getAll() || [])
      .filter((record) => !liveIds.has(record.id))
      .slice(0, HISTORY_LIMIT);
    let historyPipelines: typeof taskPipelines = [];
    if (history.length) {
      const contentEntries = await contentManager.db.getContentEntryMap(history.map((record) => record.contentKey));
      historyPipelines = mapFilterEmpty(history, (record) => {
        const contentInfo = contentEntries.get(record.contentKey)?.contentInfo;
        // Content deleted since the run happened - there's nothing sensible
        // to show for it, so leave it out rather than inventing a title.
        return contentInfo ? makeTaskPipelineInfoFromPersisted(record, contentInfo) : undefined;
      });
    }
    const queuedContent: TasksResponse = {
      taskPipelines: [...taskPipelines, ...historyPipelines],
      tasks: tasks,
      scheduledDownloads: contentManager.getScheduledDownloads(),
    };
    return sendResponse(res, queuedContent);
  });

  router.get("/task/:id", async (req: Request, res: Response) => {
    const queuedContent = taskManager.getPipelineInfo(req.params.id) || taskManager.getTaskInfo(req.params.id);
    return sendResponse(res, queuedContent);
  });

  router.post("/control", async (req: Request, res: Response) => {
    await zodParseHttp(ControlRequest, req, res, async (data) => {
      try {
        await taskManager.control(data);
        sendResponse(res, {});
      } catch (e) {
        sendErrorAsResponse(res, e, {
          code: 500,
        });
      }
    });
  });

  router.post("/clear-completed/", async (req: Request, res: Response) => {
    await taskManager.clearCompletedPipelineExecs();
    taskManager.clearCompletedTasks();
    sendResponse(res, {});
  });

  router.post("/task", async (req: Request, res: Response) => {
    await zodParseHttp(AddTaskRequest, req, res, async (data) => {
      try {
        const queuedContentInfo = await contentManager.downloadContent(data.key, {
          mediaFormat: data.mediaFormat,
          // A direct user click, not auto-download - see downloadContent's
          // `interactive` doc comment.
          interactive: true,
        });
        const response: DownloadContentResponse = {
          key: queuedContentInfo.contentKey,
          mediaInfo: queuedContentInfo.mediaInfo,
          pipelineInfo: makeTaskPipelineInfo(queuedContentInfo.pipelineExec).pipelineDetails,
        };
        sendResponse(res, response);
      } catch (e) {
        sendErrorAsResponse(res, e, {
          code: 500,
        });
      }
    });
  });

  router.post("/manual", async (req: Request, res: Response) => {
    await zodParseHttp(ManualDownloadRequest, req, res, async (data) => {
      try {
        const queuedContentInfo = await contentManager.downloadManualContent(data);
        const response: DownloadContentResponse = {
          key: queuedContentInfo.contentKey,
          mediaInfo: queuedContentInfo.mediaInfo,
          pipelineInfo: makeTaskPipelineInfo(queuedContentInfo.pipelineExec).pipelineDetails,
        };
        sendResponse(res, response);
      } catch (e) {
        sendErrorAsResponse(res, e, {
          code: 500,
        });
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
  //   logger.log("info", `downloadContent ${req.body.contentName} - ${contentName}`);
  //   try {
  //     const contentInfo = await contentManager.getContent(contentName);
  //     return res.send(contentInfo);
  //   } catch (e) {
  //     return res.status(500).send(e);
  //   }
  // });
  return router;
};
