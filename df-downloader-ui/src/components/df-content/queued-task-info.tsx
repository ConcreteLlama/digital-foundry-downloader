import { Box, Card, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import { useSelector } from "react-redux";
import { selectPipelineDetails, selectPipelineField } from "../../store/df-tasks/tasks.selector.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";
import { TaskDetailsDialog } from "../tasks/task-details-dialog.component.tsx";
import { TaskStatusDetail } from "../tasks/task-status-detail/task-status-detail.component.tsx";
import { getTaskTypeIcon } from "../tasks/task-type-icon.ts";

export type TaskComponentProps = {
  pipelineId: string;
};

/**
 * When a task started, at the length this column can afford.
 *
 * The full toLocaleString ("28/08/2026, 15:52:31") is 20 characters of mostly
 * redundant precision in a side column, and it was long enough to shove the
 * rest of the header row around. Today only needs a clock time; anything older
 * gets a day and month.
 */
const compactStartTime = (startTime: Date | string) => {
  const date = new Date(startTime);
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const isToday = new Date().toDateString() === date.toDateString();
  return isToday
    ? time
    : `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`;
};

/**
 * A pipeline for this content, as it appears in the content detail dialog.
 *
 * Sits in the same column as "On disk" and "Available formats" and now shares
 * their vernacular - same type ramp, same rhythm - because three sections that
 * answer related questions reading as three different kinds of object was what
 * made this one feel both cramped and oversized at once: 8px of padding around
 * 16px type, with a 16px gap holding it open.
 */
export const PipelineInfoSummaryDetail = ({ pipelineId }: TaskComponentProps) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const taskDetails = useSelector(selectPipelineDetails(pipelineId));
  // Above the early return, deliberately: this used to sit below it, so the
  // hook count changed with whether the pipeline had loaded yet.
  const taskPipelineType = useSelector(selectPipelineField(pipelineId, "pipelineType"));
  if (!taskDetails) {
    return <Typography>{`Task ${pipelineId} not found`}</Typography>;
  }
  const mediaType = taskDetails.mediaFormat;
  const startTime = taskDetails.queuedTime;
  const TaskTypeIcon = getTaskTypeIcon(taskPipelineType);
  return (
    <>
      <Tooltip title="Show task details" enterDelay={700}>
        <Card
          variant="outlined"
          onClick={() => setDetailsOpen(true)}
          sx={{
            padding: 1.25,
            cursor: "pointer",
            transition: "border-color 120ms ease, background-color 120ms ease",
            "&:hover": { borderColor: "text.disabled", backgroundColor: "action.hover" },
          }}
        >
          {/*
            A grid, not space-between. With three children of very different
            widths, space-between let the timestamp's length decide where the
            format sat, so two stacked cards never lined up with each other.
          */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "auto minmax(0, 1fr) auto",
              alignItems: "center",
              columnGap: 1,
              marginBottom: 1,
            }}
          >
            <TaskTypeIcon sx={{ fontSize: 14, color: "text.disabled" }} />
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }} noWrap>
              {mediaType || taskDetails.type}
            </Typography>
            {startTime && (
              <Typography
                sx={{ fontFamily: monoFontFamily, fontSize: "0.625rem", color: "text.disabled" }}
                noWrap
              >
                {compactStartTime(startTime)}
              </Typography>
            )}
          </Box>
          <TaskStatusDetail pipelineId={pipelineId} compact />
        </Card>
      </Tooltip>
      <TaskDetailsDialog
        pipelineId={pipelineId}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        hideContentLink
      />
    </>
  );
};
