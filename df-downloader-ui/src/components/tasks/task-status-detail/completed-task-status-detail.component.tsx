import { Box } from "@mui/material";
import { useSelector } from "react-redux";
import { selectPipelineErrors, selectPipelineStatus } from "../../../store/df-tasks/tasks.selector.ts";
import { EllipsisTooltipText } from "../../general/ellipsis-tooltip-text.component.tsx";

export type CompletedTaskStatusDetailProps = {
  pipelineId: string;
};

export const CompletedTaskStatusDetail = ({ pipelineId }: CompletedTaskStatusDetailProps) => {
  const pipelineStatus = useSelector(selectPipelineStatus(pipelineId));
  const { pipelineResult, statusMessage } = pipelineStatus;
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
      }}
    >
      {pipelineResult === "failed" ? (
        <FailedTaskStatusDetail pipelineId={pipelineId} />
      ) : pipelineResult === "cancelled" ? (
        <Box>Cancelled</Box>
      ) : (
        <EllipsisTooltipText text={statusMessage || "Completed"} />
      )}
    </Box>
  );
};

type FailedTaskStatusDetailProps = {
  pipelineId: string;
};

const FailedTaskStatusDetail = ({ pipelineId }: FailedTaskStatusDetailProps) => {
  const errors = useSelector(selectPipelineErrors(pipelineId));
  return (
    <Box
      sx={{
        width: "100%",
      }}
    >
      <EllipsisTooltipText text={`Failed: ${errors.join(",")}`}></EllipsisTooltipText>
    </Box>
  );
};
