import DownloadIcon from "@mui/icons-material/Download";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import TaskIcon from "@mui/icons-material/Task";
import { DfPipelineType } from "df-downloader-common";

export const getTaskTypeIcon = (taskType: DfPipelineType) => {
  switch (taskType) {
    case "download":
      return DownloadIcon;
    case "subtitles":
      return SubtitlesIcon;
    default:
      return TaskIcon;
  }
};
