import MetadataIcon from "@mui/icons-material/DataObject";
import DownloadIcon from "@mui/icons-material/Download";
import MoveIcon from "@mui/icons-material/DriveFileMove";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import ChaptersIcon from "@mui/icons-material/MenuBook";
import RefreshIcon from "@mui/icons-material/Refresh";
import { StepIconProps, Tooltip } from "@mui/material";
import { styled } from "@mui/system";
import { TaskState } from "df-downloader-common";

const scale = 1.25;

const ActiveIcon = styled("div")({
  animation: "spinAndPulse 5s infinite",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transformOrigin: "center",
  "@keyframes spinAndPulse": {
    "0%": { transform: "rotate(-360deg)" },
    "20%": { transform: "rotate(0deg) scale(1)" },
    "40%": { transform: `rotate(0deg) scale(${scale})` },
    "60%": { transform: "rotate(0deg) scale(1)" },
    "80%": { transform: `rotate(0deg) scale(${scale})` },
  },
});

const getIconComponent = (stepName: string) => {
  switch (stepName) {
    case "Download":
      return DownloadIcon;
    case "Fetch Subtitles":
      return SubtitlesIcon;
    case "Fetch Chapters":
      return ChaptersIcon;
    case "Inject Metadata":
      return MetadataIcon;
    case "Fetch chapter info":
      return ChaptersIcon;
    case "Inject metadata":
      return MetadataIcon;
    case "Move File":
      return MoveIcon;
    case "Refresh content info":
      return RefreshIcon;
    default:
      return MoveIcon;
  }
};

export type TaskPipelineStepIconProps = {
  stepName: string;
  stepStatusMessage?: string;
  taskState?: TaskState;
} & StepIconProps;

export const TaskPipelineStepIcon = ({ stepName, stepStatusMessage, active, taskState }: TaskPipelineStepIconProps) => {
  const IconComponent = getIconComponent(stepName);
  const iconColor =
    taskState === "failed"
      ? "error.main"
      : taskState === "success"
      ? "success.main"
      : taskState === "cancelled"
      ? "text.secondary"
      : active
      ? "primary"
      : "disabled";
  const tooltipTitle = `${stepName}${stepStatusMessage ? ` - ${stepStatusMessage}` : ""}`;
  const tooltipIcon = <Tooltip title={tooltipTitle}>{<IconComponent sx={{ color: iconColor }} />}</Tooltip>;
  return active ? <ActiveIcon>{tooltipIcon}</ActiveIcon> : tooltipIcon;
};
