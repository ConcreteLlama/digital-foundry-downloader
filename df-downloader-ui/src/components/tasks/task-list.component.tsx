import { DndContext, DragEndEvent } from "@dnd-kit/core";
import { Box, Button, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { clearCompletedPipelines } from "../../api/tasks.ts";
import { controlTaskAction } from "../../store/df-tasks/tasks.action.ts";
import {
  selectCompletedPipelineIds,
  selectDownloadingPipelineIds,
  selectPostProcessingPipelineIds,
  selectActiveTaskIds,
  selectCompletedTaskIds,
} from "../../store/df-tasks/tasks.selector.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";
import { ScheduledDownloadsList } from "./scheduled-downloads-list.component.tsx";
import { StandaloneTaskInfo } from "./standalone-task-info.component.tsx";
import { DraggableTaskInfo, DraggableTaskInfoData, TaskInfo } from "./task-info.component.tsx";

export const TaskList = () => {
  const downloadingTasks = useSelector(selectDownloadingPipelineIds);
  const postProcessingTasks = useSelector(selectPostProcessingPipelineIds);
  const completedTasks = useSelector(selectCompletedPipelineIds);
  // Standalone jobs - a backfill, a batch move - tracked separately from
  // pipelines and so covered by none of the groups above. Split so finished
  // ones join the rest of the history rather than sitting among live work.
  const activeTaskIds = useSelector(selectActiveTaskIds);
  const completedTaskIds = useSelector(selectCompletedTaskIds);
  const onClearCompleted = () => clearCompletedPipelines().catch((e) => console.error(e));
  const theme = useTheme();
  const belowSm = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Stack
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        paddingX: belowSm ? "0" : "8px",
        paddingY: "12px",
        width: "100%",
      }}
    >
      <ScheduledDownloadsList />
      <DraggableTaskInfoSet pipelineIds={[...downloadingTasks]} name="Downloads" noTasksMessage="No Download tasks" />
      <TaskInfoSet pipelineIds={postProcessingTasks} name="Post Processing" />
      {/* After the download groups deliberately: downloads are what this page
          is for, and a backfill running in the background should not push
          them down. Before Completed, since these are live work rather than
          history. */}
      {activeTaskIds.length > 0 && <TaskInfoSet pipelineIds={[]} taskIds={activeTaskIds} name="Jobs" />}
      <TaskInfoSet
        pipelineIds={completedTasks}
        taskIds={completedTaskIds}
        name="Completed"
        header={
          <Button
            size="small"
            disabled={completedTasks.length === 0 && completedTaskIds.length === 0}
            onClick={onClearCompleted}
          >
            Clear all
          </Button>
        }
      />
    </Stack>
  );
};

type TaskInfoSetProps = {
  pipelineIds: string[];
  /**
   * Standalone jobs to show in this group, alongside any pipelines.
   *
   * A group is a place on the page rather than a kind of thing: "Completed"
   * means finished work, and a finished backfill belongs there as much as a
   * finished download does.
   */
  taskIds?: string[];
  name: string;
  noTasksMessage?: string;
  header?: React.ReactNode;
  draggable?: boolean;
};

/**
 * A group of pipelines.
 *
 * The heading used to be a centred <Divider> with the label floating in a gap
 * either side, and any group action (Clear) sat on its own line underneath -
 * so three groups read as three unrelated blobs rather than one rack. The
 * label, its count and its action are one left-aligned row now, matching the
 * overline headings used everywhere else.
 */
const TaskInfoSet = ({ pipelineIds, taskIds = [], name, noTasksMessage, header, draggable }: TaskInfoSetProps) => {
  const count = pipelineIds.length + taskIds.length;
  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          minHeight: 32,
          paddingX: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography variant="overline">{name}</Typography>
        {count > 0 && (
          <Typography
            sx={{
              fontFamily: monoFontFamily,
              fontSize: "0.6875rem",
              color: "text.disabled",
              flexShrink: 0,
            }}
          >
            {count}
          </Typography>
        )}
        <Box sx={{ flex: "1 1 auto" }} />
        {header}
      </Box>
      {count ? (
        <Stack sx={{ gap: 1, marginTop: 1 }}>
          {taskIds.map((taskId) => (
            <StandaloneTaskInfo key={taskId} taskId={taskId} />
          ))}
          {pipelineIds.map((pipelineId) =>
            draggable ? (
              <DraggableTaskInfo key={pipelineId} pipelineId={pipelineId} />
            ) : (
              <TaskInfo key={pipelineId} pipelineId={pipelineId} />
            )
          )}
        </Stack>
      ) : (
        <Typography sx={{ color: "text.disabled", fontSize: "0.8125rem", paddingX: 1, paddingY: 1.5 }}>
          {noTasksMessage || `No ${name.toLowerCase()} tasks`}
        </Typography>
      )}
    </Box>
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
