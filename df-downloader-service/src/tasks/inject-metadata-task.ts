import { injectMediaMetadata } from "../utils/media-metadata.js";
import { taskify } from "../task-manager/utils.js";

export const InjectMetadataTask = taskify(injectMediaMetadata, {
  taskType: "inject_metadata",
});
export type InjectMetadataTask = ReturnType<typeof InjectMetadataTask>;

export const isInjectMetadataTask = (task: any): task is InjectMetadataTask => task.taskType === "inject_metadata";
