import { AddTaskRequest, ControlRequest, DownloadContentResponse, TasksResponse } from "df-downloader-common";
import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { makeTaskPipelineInfo } from "../../df-task-manager.js";
import { sendErrorAsResponse, sendResponse, zodParseHttp } from "../utils/utils.js";

export const makeDownloadsApiRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();
  const taskManager = contentManager.taskManager;

  router.get("/list", async (req: Request, res: Response) => {
    const taskPipelines = taskManager.getAllPipelineInfos();
    const tasks = taskManager.getAllTaskInfos();
    const queuedContent: TasksResponse = {
      taskPipelines: taskPipelines,
      tasks: tasks,
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
        taskManager.control(data);
        sendResponse(res, {});
      } catch (e) {
        sendErrorAsResponse(res, e, {
          code: 500,
        });
      }
    });
  });

  router.post("/clear-completed/", async (req: Request, res: Response) => {
    taskManager.clearCompletedPipelineExecs();
    taskManager.clearCompletedTasks();
    sendResponse(res, {});
  });

  router.post("/task", async (req: Request, res: Response) => {
    await zodParseHttp(AddTaskRequest, req, res, async (data) => {
      try {
        const queuedContentInfo = await contentManager.downloadContent(data.name, {
          mediaType: data.mediaType,
        });
        const response: DownloadContentResponse = {
          name: queuedContentInfo.contentName,
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
