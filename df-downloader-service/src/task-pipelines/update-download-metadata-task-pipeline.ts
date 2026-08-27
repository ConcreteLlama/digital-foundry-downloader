import { DfContentInfo, MediaFileMeta } from "df-downloader-common";
import { makeMediaFileMeta } from "../df-mpeg-meta.js";
import { TaskManager } from "../task-manager/task-manager.js";
import { TaskPipelineExecution, makeTaskPipeline } from "../task-manager/task-pipeline.js";
import { FetchChaptersTask } from "../tasks/fetch-chapters-task.js";
import { InjectMetadataTask } from "../tasks/inject-metadata-task.js";
import { RefreshContentInfoTask } from "../tasks/refresh-content-info-task.js";
import { MeasureDurationTask } from "../tasks/measure-duration-task.js";
import { Chapter } from "../utils/chatpers.js";

type UpdateDownloadMetaPipelineCreatorOpts = {
  fileTaskManager: TaskManager;
  /** Whole-file reads/writes (remux) - serialized, see df-task-manager.ts. */
  mediaProcessingTaskManager: TaskManager;
  dfFetchTaskManager: TaskManager;
  youtubeFetchTaskManager: TaskManager;
};

export const createUpdateDownloadMetadataTaskPipeline = (opts: UpdateDownloadMetaPipelineCreatorOpts) => {
  const { fileTaskManager, mediaProcessingTaskManager, dfFetchTaskManager, youtubeFetchTaskManager } = opts;
  return makeTaskPipeline<
    {
      dfContentInfo: DfContentInfo;
      fileLocation: string;
      mediaFileMeta?: MediaFileMeta;
    },
    "update_download_meta"
  >("update_download_meta")
    .next({
      stepName: "Refresh content info",
      taskCreator: ({ context }) => {
        if (context.mediaFileMeta) {
          return null;
        }
        return RefreshContentInfoTask(context.dfContentInfo.key, context.dfContentInfo.title);
      },
      continueOnFail: true,
      taskManager: dfFetchTaskManager,
    })
    // The file already exists here, so measure it for the same reason the
    // download pipeline does: it's the only way to tell that YouTube's
    // chapters describe a longer cut of the video than this file.
    .next({
      stepName: "Measure duration",
      taskCreator: ({ context }) => {
        if (context.mediaFileMeta) {
          return null;
        }
        return MeasureDurationTask(context.dfContentInfo.key, context.fileLocation);
      },
      continueOnFail: true,
      taskManager: fileTaskManager,
    })
    .next({
      stepName: "Fetch chapter info",
      taskCreator: ({ context, allResults }) => {
        if (context.mediaFileMeta) {
          return null;
        }
        const [_contentInfoResult, measureResult] = allResults;
        const measured = measureResult?.status === "success" ? measureResult.result : null;
        return FetchChaptersTask(context.dfContentInfo, measured?.durationSeconds ?? null);
      },
      continueOnFail: true,
      taskManager: youtubeFetchTaskManager,
    })
    .next({
      stepName: "Inject metadata",
      taskCreator: ({ context, allResults }) => {
        const { fileLocation, mediaFileMeta } = context;
        const [ contentInfoResult, _measureResult, chapterInfoResult ] = allResults;
        let meta: MediaFileMeta | null = mediaFileMeta || null;
        if (!meta) {
          const contentInfo = contentInfoResult?.status === "success" ? contentInfoResult.result : null;
          const ytMeta = chapterInfoResult?.status === "success" ? chapterInfoResult.result : null;
          // See download-task-pipeline.ts's Inject Metadata step - fold in a
          // freshly-resolved YouTube description if the refreshed
          // contentInfo didn't already have one.
          const mergedContentInfo = contentInfo
            ? { ...contentInfo, description: contentInfo.description || ytMeta?.description }
            : null;
          meta = makeMediaFileMeta(mergedContentInfo, null, ytMeta?.chapters ?? null);
        }
        return InjectMetadataTask(fileLocation, meta);
      },
      taskManager: mediaProcessingTaskManager,
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

