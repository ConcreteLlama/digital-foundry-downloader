import { DfContentInfo } from "df-downloader-common";
import { makeMediaMeta } from "../df-mpeg-meta.js";
import { TaskManager } from "../task-manager/task-manager.js";
import { TaskPipelineExecution, makeTaskPipeline } from "../task-manager/task-pipeline.js";
import { FetchChaptersTask } from "../tasks/fetch-chapters-task.js";
import { InjectMetadataTask } from "../tasks/inject-metadata-task.js";
import { RefreshContentInfoTask } from "../tasks/refresh-content-info-task.js";
import { Chapter } from "../utils/chatpers.js";

type UpdateDownloadMetaPipelineCreatorOpts = {
  fileTaskManager: TaskManager;
  dfFetchTaskManager: TaskManager;
  youtubeFetchTaskManager: TaskManager;
};

export const createUpdateDownloadMetadataTaskPipeline = (opts: UpdateDownloadMetaPipelineCreatorOpts) => {
  const { fileTaskManager, dfFetchTaskManager, youtubeFetchTaskManager } = opts;
  return makeTaskPipeline<
    {
      dfContentInfo: DfContentInfo;
      fileLocation: string;
      updatedContentInfo?: DfContentInfo;
      updatedChapters?: Chapter[];
    },
    "update_download_meta"
  >("update_download_meta")
    .next({
      stepName: "Refresh content info",
      taskCreator: ({ context }) => {
        if (context.updatedContentInfo) {
          return null;
        }
        return RefreshContentInfoTask(context.dfContentInfo.name);
      },
      continueOnFail: true,
      taskManager: dfFetchTaskManager,
    })
    .next({
      stepName: "Fetch chapter info",
      taskCreator: ({ context }) => {
        if (context.updatedChapters) {
          return null;
        }  
        return FetchChaptersTask(context.dfContentInfo);
      },
      continueOnFail: true,
      taskManager: youtubeFetchTaskManager,
    })
    .next({
      stepName: "Inject metadata",
      taskCreator: ({ context, allResults }) => {
        const { fileLocation, updatedChapters, updatedContentInfo } = context;
        const [ contentInfoResult, chapterInfoResult ] = allResults;
        const contentInfo = updatedContentInfo || (contentInfoResult?.status === "success" ? contentInfoResult.result : null);
        const chapters = updatedChapters || (chapterInfoResult?.status === "success" ? chapterInfoResult.result : null);
        const meta = makeMediaMeta(contentInfo, null, chapters);
        return InjectMetadataTask(fileLocation, meta);
      },
      taskManager: fileTaskManager,
    })
    .build({
      reduceResults: (results) => {
        return results;
      }
    });
};
export type UpdateDownloadMetadataTaskPipeline = ReturnType<typeof createUpdateDownloadMetadataTaskPipeline>;
export type UpdateDownloadMetadataTaskPipelineExecution = ReturnType<UpdateDownloadMetadataTaskPipeline["start"]>;

export const isUpdateDownloadMetadataTaskPipeline = (
  execution: TaskPipelineExecution<any, any, any, any>
): execution is UpdateDownloadMetadataTaskPipelineExecution => execution.pipelineType === "update_download_meta";

