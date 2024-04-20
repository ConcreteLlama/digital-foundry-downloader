import { injectMediaMetadata } from "../utils/media-metadata.js";
import { taskify } from "../task-manager/utils.js";

export const MetadataTask = taskify(injectMediaMetadata, {
  taskType: "metadata",
});
export type MetadataTask = ReturnType<typeof MetadataTask>;

export const isMetadataTask = (task: any): task is MetadataTask => task.taskType === "inject_metadata";
