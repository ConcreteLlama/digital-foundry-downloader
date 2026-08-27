import { writeSubtitleSidecar } from "../media-utils/subtitles/sidecar.js";
import { taskify } from "../task-manager/utils.js";

export const WriteSubtitlesSidecarTask = taskify(writeSubtitleSidecar, {
  taskType: "write_subtitles_sidecar",
  idPrefix: "writeSubtitleSidecar",
});
export type WriteSubtitlesSidecarTask = ReturnType<typeof WriteSubtitlesSidecarTask>;
