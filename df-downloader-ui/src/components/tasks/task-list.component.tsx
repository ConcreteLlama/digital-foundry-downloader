import { DndContext, DragEndEvent } from "@dnd-kit/core";
import { Box, Button, Divider, Stack, Typography, useMediaQuery } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { Fragment } from "react/jsx-runtime";
import { clearCompletedPipelines } from "../../api/tasks.ts";
import { controlTaskAction } from "../../store/df-tasks/tasks.action.ts";
import {
  selectCompletedPipelineIds,
  selectDownloadingPipelineIds,
  selectPostProcessingPipelineIds,
} from "../../store/df-tasks/tasks.selector.ts";
import { theme } from "../../themes/theme.ts";
import { DraggableTaskInfo, DraggableTaskInfoData, TaskInfo } from "./task-info.component.tsx";

export const TaskList = () => {
  const downloadingTasks = useSelector(selectDownloadingPipelineIds);
  const postProcessingTasks = useSelector(selectPostProcessingPipelineIds);
  const completedTasks = useSelector(selectCompletedPipelineIds);
  const onClearCompleted = () => clearCompletedPipelines().catch((e) => console.error(e));
  const belowSm = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Stack
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        paddingX: belowSm ? "0" : "8px",
        paddingY: "12px",
        width: "100%",
      }}
    >
      <DraggableTaskInfoSet pipelineIds={[...downloadingTasks]} name="Downloads" noTasksMessage="No Download tasks" />
      <TaskInfoSet pipelineIds={postProcessingTasks} name="Post Processing" />
      <TaskInfoSet
        pipelineIds={completedTasks}
        name="Completed"
        header={
          <Box sx={{ display: "flex", justifyContent: "right" }}>
            <Button variant="outlined" disabled={completedTasks.length === 0} onClick={onClearCompleted}>
              Clear
            </Button>
          </Box>
        }
      />
    </Stack>
  );
};

type TaskInfoSetProps = {
  pipelineIds: string[];
  name: string;
  noTasksMessage?: string;
  header?: React.ReactNode;
  draggable?: boolean;
};

const TaskInfoSet = ({ pipelineIds, name, noTasksMessage, header, draggable }: TaskInfoSetProps) => {
  return (
    <Fragment>
      <Divider>{name}</Divider>
      {pipelineIds.length ? (
        <Fragment>
          {header ? header : null}
          {pipelineIds.map((pipelineId) =>
            draggable ? <DraggableTaskInfo pipelineId={pipelineId} /> : <TaskInfo pipelineId={pipelineId} />
          )}
        </Fragment>
      ) : (
        <Typography color={"gray"}>{noTasksMessage || `No ${name} tasks`}</Typography>
      )}
    </Fragment>
  );
};

const DraggableTaskInfoSet = (props: TaskInfoSetProps) => {
  const dispatch = useDispatch();
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const activeData = active.data.current as DraggableTaskInfoData;
    const overData = over?.data.current as DraggableTaskInfoData;
    if (!overData) {
      return;
    }
    const { pipelineId, stepId } = activeData;
    const newPosition = overData.position;
    dispatch(
      controlTaskAction.start({
        pipelineExecutionId: pipelineId,
        stepId,
        action: {
          action: "change_position",
          position: newPosition,
        },
      })
    );
  };
  return (
    <DndContext onDragEnd={handleDragEnd}>
      <TaskInfoSet draggable {...props} />
    </DndContext>
  );
};
