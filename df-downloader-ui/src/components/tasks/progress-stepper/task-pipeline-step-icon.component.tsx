import MetadataIcon from "@mui/icons-material/DataObject";
import DownloadIcon from "@mui/icons-material/Download";
import MoveIcon from "@mui/icons-material/DriveFileMove";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import { StepIconProps, Tooltip } from "@mui/material";
import { TaskState } from "df-downloader-common";
import { styled } from "@mui/system";

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

export type TaskPipelineStepIconProps = {
  stepName: string;
  taskState?: TaskState;
} & StepIconProps;

const getIconComponent = (stepName: string) => {
  switch (stepName) {
    case "Download":
      return DownloadIcon;
    case "Fetch Subtitles":
      return SubtitlesIcon;
    case "Inject Metadata":
      return MetadataIcon;
    case "Move File":
      return MoveIcon;
    default:
      return MoveIcon;
  }
};

export const TaskPipelineStepIcon = ({ stepName, active, taskState }: TaskPipelineStepIconProps) => {
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

  const tooltipIcon = <Tooltip title={stepName}>{<IconComponent sx={{ color: iconColor }} />}</Tooltip>;
  return active ? <ActiveIcon>{tooltipIcon}</ActiveIcon> : tooltipIcon;
};
