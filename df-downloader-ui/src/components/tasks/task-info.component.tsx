import { DraggableAttributes, useDraggable, useDroppable } from "@dnd-kit/core";
import { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities/useSyntheticListeners";
import { Box } from "@mui/material";
import { useSelector } from "react-redux";
import { selectBasicTaskField, selectCurrentStep, selectPipelineDetails } from "../../store/df-tasks/tasks.selector.ts";
import { EllipsisTooltipText } from "../general/ellipsis-tooltip-text.component.tsx";
import { TaskInfoCard } from "./task-info.styles.tsx";
import { TaskStatusDetail } from "./task-status-detail/task-status-detail.component.tsx";
import { getTaskTypeIcon } from "./task-type-icon.ts";

export type TaskInfoProps = {
  pipelineId: string;
};

// 3 rows - 1st row: Task Name, 2nd row: Task stepper status, 3rd row is task specific progress info
// (for downloads this will be size, speed, eta etc. w/background gradient indicating progress)
export const TaskInfo = ({ pipelineId }: TaskInfoProps) => {
  return (
    <TaskInfoCard>
      <TaskHeaderItem pipelineId={pipelineId} />
      <TaskStatusDetail pipelineId={pipelineId} />
    </TaskInfoCard>
  );
};

export type DraggableTaskInfoData = {
  pipelineId: string;
  position: number;
  stepId: string;
};
export const DraggableTaskInfo = ({ pipelineId }: TaskInfoProps) => {
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
  });
  const {
    attributes,
    listeners,
    setNodeRef: draggableSetNodeRef,
    transform,
  } = useDraggable({
    id: pipelineId,
    data,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(1.01)`,
      }
    : {};
  return (
    <TaskInfoCard ref={droppableSetNodeRef} sx={{ ...style }}>
      <TaskHeaderItem
        pipelineId={pipelineId}
        draggableProps={{
          ref: draggableSetNodeRef,
          listeners,
          attributes,
        }}
      />
      <TaskStatusDetail pipelineId={pipelineId} />
    </TaskInfoCard>
  );
};

type TaskHeaderItemProps = {
  pipelineId: string;
  draggableProps?: {
    ref: (element: HTMLElement | null) => void;
    listeners: SyntheticListenerMap | undefined;
    attributes: DraggableAttributes;
  };
};
export const TaskHeaderItem = ({ pipelineId, draggableProps }: TaskHeaderItemProps) => {
  const { dfContent, mediaType } = useSelector(selectPipelineDetails(pipelineId));
  const pipelineDetails = useSelector(selectPipelineDetails(pipelineId));
  const { ref, listeners, attributes } = draggableProps || {};
  const TaskTypeIcon = getTaskTypeIcon(pipelineDetails.type);
  return (
    <Box
      ref={ref}
      {...attributes}
      {...listeners}
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        gap: "8px",
        justifyContent: "space-between",
        cursor: draggableProps ? "grab" : "default",
      }}
    >
      <TaskTypeIcon />
      <EllipsisTooltipText
        text={dfContent?.title || "UNKNOWN"}
        sx={{
          maxWidth: "100%",
        }}
      >
        {dfContent?.title || "UNKNOWN"}
      </EllipsisTooltipText>
      <EllipsisTooltipText
        text={mediaType}
        variant="subtitle1"
        sx={{
          minWidth: "4rem",
        }}
      >
        {mediaType}
      </EllipsisTooltipText>
    </Box>
  );
};
