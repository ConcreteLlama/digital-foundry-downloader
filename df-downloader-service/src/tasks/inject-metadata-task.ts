import { MediaFileMeta } from "df-downloader-common";
import path from "path";
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
    /*
     * Names what is being written and to what.
     *
     * A bulk metadata backfill queues one of these per item, so without this
     * a run over a library is a wall of identical rows reading "Inject
     * metadata / In state: success" - which says neither which file it was
     * nor that anything useful happened.
     */
    describe: (state: string, mediaFilePath: string, meta: MediaFileMeta, _opts?: InjectMediaMetadataOpts) => {
      const subject = meta.title || path.basename(mediaFilePath);
      switch (state) {
        case "running":
          return `Writing metadata into ${subject}`;
        case "success":
          return `Metadata written to ${subject}`;
        case "failed":
          return `Could not write metadata to ${subject}`;
        case "cancelled":
          return `Stopped before writing metadata to ${subject}`;
        default:
          return `Metadata for ${subject}`;
      }
    },
  }
);
export type InjectMetadataTask = ReturnType<typeof InjectMetadataTask>;

export const isInjectMetadataTask = (task: any): task is InjectMetadataTask => task.taskType === "inject_metadata";
