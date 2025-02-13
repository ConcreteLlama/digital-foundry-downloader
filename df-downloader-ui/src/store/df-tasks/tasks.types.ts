import { TaskInfo, TaskPipelineInfo } from "df-downloader-common";
import { QueryableState } from "../utils";
import { DfUiError } from "../../utils/error";

export interface DownloadQueueState extends QueryableState {
  loading: boolean;
  taskPipelineIds: string[];
  taskPipelines: Record<string, TaskPipelineInfo>;
  taskIds: string[];
  tasks: Record<string, TaskInfo>;
  error: DfUiError | null;
}
