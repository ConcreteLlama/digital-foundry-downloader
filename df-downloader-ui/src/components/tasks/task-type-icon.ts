import DownloadIcon from "@mui/icons-material/Download";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import TaskIcon from "@mui/icons-material/Task";
import MetadataIcon from "@mui/icons-material/DataObject";
import { DfPipelineType } from "df-downloader-common";

export const getTaskTypeIcon = (taskType: DfPipelineType) => {
  switch (taskType) {
    case "download":
      return DownloadIcon;
    case "subtitles":
      return SubtitlesIcon;
    case "update_download_meta":
      return MetadataIcon;
    default:
      return TaskIcon;
  }
};
