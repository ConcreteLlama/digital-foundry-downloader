import { MediaFileMeta } from "df-downloader-common";
import { InjectMediaMetadataOpts, injectMediaMetadata } from "../utils/media-metadata.js";
import { taskifyWithProgress } from "../task-manager/utils.js";

// taskifyWithProgress rather than taskify so the remux can report how far
// through it is - it rewrites the whole file, which on a feature-length
// download is minutes of otherwise-silent work.
export const InjectMetadataTask = taskifyWithProgress(
  (onProgress, mediaFilePath: string, meta: MediaFileMeta, opts: InjectMediaMetadataOpts = {}) =>
    injectMediaMetadata(mediaFilePath, meta, { ...opts, onProgress }),
  {
    taskType: "inject_metadata",
    idPrefix: "injectMediaMetadata",
  }
);
export type InjectMetadataTask = ReturnType<typeof InjectMetadataTask>;

export const isInjectMetadataTask = (task: any): task is InjectMetadataTask => task.taskType === "inject_metadata";
