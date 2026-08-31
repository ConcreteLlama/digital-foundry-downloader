import { DraggableAttributes, useDraggable, useDroppable } from "@dnd-kit/core";
import { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities/useSyntheticListeners";
import { Box, Tooltip } from "@mui/material";
import { useState } from "react";
import { useSelector } from "react-redux";
import { selectBasicTaskField, selectCurrentStep, selectIsComplete, selectPipelineDetails, selectPipelineField, selectPipelineStatus } from "../../store/df-tasks/tasks.selector.ts";
import { EllipsisTooltipText } from "../general/ellipsis-tooltip-text.component.tsx";
import { TaskDetailsDialog } from "./task-details-dialog.component.tsx";
import { CompletedTaskRow, TaskInfoCard } from "./task-info.styles.tsx";
import { CompletedTaskControls } from "./task-controls.component.tsx";
import { TaskStatusDetail } from "./task-status-detail/task-status-detail.component.tsx";
import { getTaskTypeIcon } from "./task-type-icon.ts";

export type TaskInfoProps = {
  pipelineId: string;
};

// 3 rows - 1st row: Task Name, 2nd row: Task stepper status, 3rd row is task specific progress info
// (for downloads this will be size, speed, eta etc. w/background gradient indicating progress)
export const TaskInfo = ({ pipelineId }: TaskInfoProps) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isComplete = useSelector(selectIsComplete(pipelineId));
  const pipelineStatus = useSelector(selectPipelineStatus(pipelineId));
  // A failed pipeline keeps the full card so its track stays visible; success
  // and cancellation are history and collapse to one line.
  const collapsed = isComplete && pipelineStatus?.pipelineResult !== "failed";
  return (
    <>
      <Tooltip title="Show details" enterDelay={700}>
        {collapsed ? (
          <CompletedTaskRow onClick={() => setDetailsOpen(true)}>
            <TaskHeaderItem pipelineId={pipelineId} compact />
            <TaskStatusDetail pipelineId={pipelineId} />
            <CompletedTaskControls pipelineId={pipelineId} />
          </CompletedTaskRow>
        ) : (
          <TaskInfoCard onClick={() => setDetailsOpen(true)} sx={{ cursor: "pointer" }}>
            <TaskHeaderItem pipelineId={pipelineId} />
            <TaskStatusDetail pipelineId={pipelineId} />
          </TaskInfoCard>
        )}
      </Tooltip>
      <TaskDetailsDialog pipelineId={pipelineId} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </>
  );
};

export type DraggableTaskInfoData = {
  pipelineId: string;
  position: number;
  stepId: string;
};
/**
 * A reorderable row.
 *
 * `locked` pins work that is running and cannot be suspended. Moving such a
 * task out of the concurrency window makes the task manager requeue it, which
 * is a pause - and a task type that never implemented pause ignores it, so the
 * manager frees a slot that is still occupied and starts another job beside
 * it. Pinning is what keeps that from being reachable by dragging.
 */
export const DraggableTaskInfo = ({ pipelineId, locked = false }: TaskInfoProps & { locked?: boolean }) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const stepId = useSelector(selectCurrentStep(pipelineId));
  const itemPosition = useSelector(selectBasicTaskField(pipelineId, stepId!, "position"));
  const data: DraggableTaskInfoData = {
    pipelineId,
    position: itemPosition,
    stepId: stepId!,
  };
  const { setNodeRef: droppableSetNodeRef } = useDroppable({
    id: pipelineId,
    data,
    disabled: locked,
  });
  const {
    attributes,
    listeners,
    setNodeRef: draggableSetNodeRef,
    transform,
  } = useDraggable({
    id: pipelineId,
    data,
    disabled: locked,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(1.01)`,
      }
    : {};
  return (
    <>
      {/* The click target is the card body only - the header is the drag
          handle, so putting onClick there would fire a details dialog every
          time someone finished reordering the queue. */}
      <TaskInfoCard ref={droppableSetNodeRef} sx={{ ...style }}>
        <TaskHeaderItem
          pipelineId={pipelineId}
          draggableProps={
            locked
              ? undefined
              : {
                  ref: draggableSetNodeRef,
                  listeners,
                  attributes,
                }
          }
        />
        <Tooltip title="Show details" enterDelay={700}>
          <Box onClick={() => setDetailsOpen(true)} sx={{ cursor: "pointer", width: "100%" }}>
            <TaskStatusDetail pipelineId={pipelineId} />
          </Box>
        </Tooltip>
      </TaskInfoCard>
      <TaskDetailsDialog pipelineId={pipelineId} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </>
  );
};

type TaskHeaderItemProps = {
  pipelineId: string;
  /** One-line layout for a completed row. */
  compact?: boolean;
  draggableProps?: {
    ref: (element: HTMLElement | null) => void;
    listeners: SyntheticListenerMap | undefined;
    attributes: DraggableAttributes;
  };
};
export const TaskHeaderItem = ({ pipelineId, draggableProps, compact }: TaskHeaderItemProps) => {
  const { dfContent, mediaFormat } = useSelector(selectPipelineDetails(pipelineId));
  const taskPipelineType = useSelector(selectPipelineField(pipelineId, "pipelineType"));
  const { ref, listeners, attributes } = draggableProps || {};
  const TaskTypeIcon = getTaskTypeIcon(taskPipelineType);
  return (
    <Box
      ref={ref}
      {...attributes}
      {...listeners}
      sx={
        compact
          ? // display:contents drops this wrapper out of the box tree so the
            // icon, title and format become columns of CompletedTaskRow's grid
            // and therefore align across rows.
            { display: "contents" }
          : {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              width: "100%",
              gap: "8px",
              justifyContent: "space-between",
              cursor: draggableProps ? "grab" : "default",
            }
      }
    >
      <TaskTypeIcon fontSize={compact ? "small" : "medium"} />
      <EllipsisTooltipText
        text={dfContent?.title || "UNKNOWN"}
        variant={compact ? "body2" : undefined}
        sx={{
          maxWidth: "100%",
        }}
      >
        {dfContent?.title || "UNKNOWN"}
      </EllipsisTooltipText>
      <EllipsisTooltipText
        text={mediaFormat}
        variant={compact ? "body2" : "subtitle1"}
        sx={{
          minWidth: compact ? 0 : "4rem",
        }}
      >
        {mediaFormat}
      </EllipsisTooltipText>
    </Box>
  );
};
