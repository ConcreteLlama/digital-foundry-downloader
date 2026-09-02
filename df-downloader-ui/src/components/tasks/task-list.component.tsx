import { DndContext, DragEndEvent } from "@dnd-kit/core";
import {
  Box,
  Button,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DfPipelineType } from "df-downloader-common";
import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { clearCompletedPipelines } from "../../api/tasks.ts";
import { controlTaskAction } from "../../store/df-tasks/tasks.action.ts";
import {
  LaneItem,
  selectActiveTaskIds,
  selectCompletedPipelineIds,
  selectCompletedTaskIds,
  selectCompletedTitles,
  selectLiveLaneItems,
} from "../../store/df-tasks/tasks.selector.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";
import { ScheduledDownloadsList } from "./scheduled-downloads-list.component.tsx";
import { TaskManagerPanel } from "./task-manager-panel.component.tsx";
import { StandaloneTaskInfo } from "./standalone-task-info.component.tsx";
import { DraggableTaskInfo, DraggableTaskInfoData, TaskInfo } from "./task-info.component.tsx";

/**
 * Live work, grouped by what kind of work it is.
 *
 * This used to be grouped by phase - "Downloads" and "Post Processing" - and
 * ordered within each by queue position. That put a running AI analysis
 * underneath three hundred queued transcriptions, because position is a
 * queue index and the AI job's index is simply larger. Something that is
 * running is exactly what you came to the page to look at, so burying it is
 * the wrong answer whatever the number says.
 *
 * Grouping by kind fixes that, and is also closer to how the service really
 * works: there is no single queue. Downloads, media processing, DF requests
 * and bulk operations each have their own TaskManager and their own
 * concurrency limit, so these lanes genuinely do progress independently
 * rather than competing for one slot.
 */
const LANES: { type: DfPipelineType; label: string; emptyMessage?: string }[] = [
  { type: "download", label: "Downloads", emptyMessage: "No download tasks" },
  { type: "subtitles", label: "Subtitles" },
  { type: "ai_analysis", label: "AI analysis" },
  { type: "update_download_meta", label: "Metadata" },
];

type StateFilter = "all" | "running" | "queued" | "held" | "completed";

const matchesFilter = (item: LaneItem, filter: StateFilter) => {
  switch (filter) {
    case "running":
      return item.running;
    case "queued":
      return !item.running && !item.held;
    case "held":
      return item.held;
    case "completed":
      // Finished work is not in a lane at all - see the Completed section.
      return false;
    default:
      return true;
  }
};

const matchesSearch = (title: string, search: string) =>
  !search.trim() || title.toLowerCase().includes(search.trim().toLowerCase());

/** How much of a lane is shown before the rest is folded away. */
const LANE_PREVIEW_COUNT = 6;

export const TaskList = () => {
  const laneItems = useSelector(selectLiveLaneItems);
  const completedTasks = useSelector(selectCompletedPipelineIds);
  // Standalone jobs - a backfill, a batch move - tracked separately from
  // pipelines and so covered by none of the lanes above. Split so finished
  // ones join the rest of the history rather than sitting among live work.
  const activeTaskIds = useSelector(selectActiveTaskIds);
  const completedTaskIds = useSelector(selectCompletedTaskIds);
  const [filter, setFilter] = useState<StateFilter>("all");
  const [search, setSearch] = useState("");
  const completedTitles = useSelector(selectCompletedTitles);
  const onClearCompleted = () => clearCompletedPipelines().catch((e) => console.error(e));
  const theme = useTheme();
  const belowSm = useMediaQuery(theme.breakpoints.down("sm"));

  const counts = useMemo(
    () => ({
      running: laneItems.filter((item) => item.running).length,
      queued: laneItems.filter((item) => !item.running && !item.held).length,
      held: laneItems.filter((item) => item.held).length,
      completed: completedTasks.length + completedTaskIds.length,
    }),
    [laneItems, completedTasks, completedTaskIds]
  );

  // Searched here rather than inside each lane so a lane's own count reflects
  // what the search left, instead of claiming a total it is no longer showing.
  const searched = useMemo(
    () => laneItems.filter((item) => matchesSearch(item.title, search)),
    [laneItems, search]
  );
  const searchedCompleted = useMemo(
    () => completedTasks.filter((id) => matchesSearch(completedTitles[id] ?? "", search)),
    [completedTasks, completedTitles, search]
  );

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

      {/* Above the filters on purpose: a paused queue explains why nothing is
          moving, and that has to be readable before the reader starts
          wondering which filter is hiding their work. */}
      <TaskManagerPanel />

      {(laneItems.length > 0 || counts.completed > 0) && (
        <QueueSummary
          counts={counts}
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          belowSm={belowSm}
        />
      )}

      {/* Live lanes step aside entirely for the Completed filter - it is
          history, and mixing it with running work is the thing the lanes
          exist to avoid. */}
      {filter !== "completed" &&
        LANES.map(({ type, label, emptyMessage }) => {
        const all = searched.filter((item) => item.pipelineType === type);
        // A lane with nothing in it is noise, with one exception: downloads
        // are what this page is primarily for, so its absence is worth
        // stating rather than leaving a gap where the section used to be.
        if (!all.length && !emptyMessage) {
          return null;
        }
        return (
          <TaskLane key={type} label={label} items={all} filter={filter} emptyMessage={emptyMessage} />
        );
      })}

      {/* After the lanes deliberately: downloads and their follow-on work are
          what this page is for, and a backfill running in the background
          should not push them down. Before Completed, since these are live
          work rather than history. */}
      {filter !== "completed" && activeTaskIds.length > 0 && (
        <TaskInfoSet pipelineIds={[]} taskIds={activeTaskIds} name="Jobs" />
      )}

      {/* Hidden while filtering to a live state: "Running" means running, and
          a history section under it answers a question nobody asked. */}
      {(filter === "all" || filter === "completed") && (
      <TaskInfoSet
        pipelineIds={searchedCompleted}
        taskIds={search.trim() ? [] : completedTaskIds}
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
      )}
    </Stack>
  );
};

/**
 * The whole picture in one line, and the filter that narrows it.
 *
 * The counts double as the summary - "3 running · 298 queued" answers "what
 * is this machine doing" without scrolling through lanes to work it out.
 */
const QueueSummary = ({
  counts,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  belowSm,
}: {
  counts: { running: number; queued: number; held: number; completed: number };
  filter: StateFilter;
  onFilterChange: (filter: StateFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  belowSm: boolean;
}) => {
  const total = counts.running + counts.queued + counts.held;
  /*
   * Every state carries an explanation. "Held" in particular is this app's own
   * word for something with no obvious meaning from the outside - it was asked
   * about directly, which is answer enough that a label alone will not do.
   */
  const options: { value: StateFilter; label: string; count: number; hint: string }[] = [
    { value: "all", label: "All", count: total, hint: "Everything not yet finished." },
    { value: "running", label: "Running", count: counts.running, hint: "Work happening right now." },
    {
      value: "queued",
      label: "Queued",
      count: counts.queued,
      hint: "Waiting its turn. It will start on its own as things ahead of it finish.",
    },
    {
      value: "held",
      label: "Held",
      count: counts.held,
      hint: "Queued work you paused by hand. It is kept out of the queue, so everything behind it carries on past it, until you resume it.",
    },
    {
      value: "completed",
      label: "Completed",
      count: counts.completed,
      hint: "Finished work, kept as history until cleared.",
    },
  ];
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, paddingX: 1 }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={filter}
        onChange={(_event, value: StateFilter | null) => value && onFilterChange(value)}
        sx={{ flexWrap: "wrap" }}
      >
        {options.map((option) => (
          <Tooltip key={option.value} title={option.hint}>
            {/* Wrapped: a disabled control does not emit the events a tooltip
                listens for, so the explanation would vanish exactly when it
                is most needed. */}
            <span>
              <ToggleButton
                value={option.value}
                // Held only exists once something has been held, and an
                // always-on zero is a control that never does anything.
                disabled={option.count === 0 && (option.value === "held" || option.value === "completed")}
                sx={{ textTransform: "none", paddingY: 0.25 }}
              >
                {option.label}
                <Box component="span" sx={{ fontFamily: monoFontFamily, marginLeft: 0.75, opacity: 0.7 }}>
                  {option.count}
                </Box>
              </ToggleButton>
            </span>
          </Tooltip>
        ))}
      </ToggleButtonGroup>

      <TextField
        size="small"
        placeholder="Search by title"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        sx={{ flex: belowSm ? "1 1 100%" : "0 1 260px" }}
      />
      {!belowSm && counts.running > 0 && (
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          {counts.running} running now
        </Typography>
      )}
    </Box>
  );
};

type TaskLaneProps = {
  label: string;
  items: LaneItem[];
  filter: StateFilter;
  emptyMessage?: string;
};

/**
 * One kind of work, in queue order.
 *
 * Running items are left in the list rather than lifted into a separate
 * "active" shelf, because they genuinely occupy queue positions: shifting a
 * running download down past the concurrency limit is how you pause it. A
 * shelf would have made that gesture impossible to express.
 */
const TaskLane = ({ label, items, filter, emptyMessage }: TaskLaneProps) => {
  const dispatch = useDispatch();
  const [expanded, setExpanded] = useState(false);

  const visible = items.filter((item) => matchesFilter(item, filter));
  const running = items.filter((item) => item.running).length;

  /*
   * Reordering is only offered when every item in the lane is waiting on the
   * same queue.
   *
   * `position` is an index within one TaskManager, and there are several -
   * downloads, media processing, DF requests, bulk operations - each with its
   * own numbering. A lane can briefly hold items sitting on different steps
   * and therefore different managers, and dropping one onto another's index
   * would move it to that index in its *own* queue, which is not what the
   * gesture looked like it did. Offering nothing is better than that.
   */
  const taskTypes = new Set(items.map((item) => item.taskType).filter(Boolean));
  const sameQueue = taskTypes.size <= 1;

  /*
   * Work that is running and cannot be suspended pins the top of the lane.
   * Nothing may be dropped above it: doing so pushes it out of the
   * concurrency window, which the task manager handles by requeueing - a
   * pause - and a task type with no pause implementation ignores that
   * silently while continuing to run. The slot would then be handed to
   * something else on top of it.
   */
  const pinned = items.filter((item) => item.running && !item.canPause);
  const minPosition = pinned.length ? Math.max(...pinned.map((item) => item.position)) + 1 : 0;
  const draggable = sameQueue && items.length > 1;

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const activeData = active.data.current as DraggableTaskInfoData | undefined;
    const overData = over?.data.current as DraggableTaskInfoData | undefined;
    if (!activeData || !overData) {
      return;
    }
    const position = Math.max(overData.position, minPosition);
    dispatch(
      controlTaskAction.start({
        pipelineExecutionId: activeData.pipelineId,
        stepId: activeData.stepId,
        action: { action: "change_position", position },
      })
    );
  };

  const shown = expanded || filter !== "all" ? visible : visible.slice(0, LANE_PREVIEW_COUNT);
  const hidden = visible.length - shown.length;

  const rows = (
    <Stack sx={{ gap: 1, marginTop: 1 }}>
      {shown.map((item) =>
        draggable ? (
          <DraggableTaskInfo
            key={item.pipelineId}
            pipelineId={item.pipelineId}
            locked={item.running && !item.canPause}
          />
        ) : (
          <TaskInfo key={item.pipelineId} pipelineId={item.pipelineId} />
        )
      )}
    </Stack>
  );

  return (
    <Box>
      <LaneHeader label={label} total={items.length} running={running} shownCount={visible.length} filter={filter} />
      {visible.length ? (
        <>
          {draggable ? <DndContext onDragEnd={handleDragEnd}>{rows}</DndContext> : rows}
          {hidden > 0 && (
            <Button size="small" onClick={() => setExpanded(true)} sx={{ marginTop: 1 }}>
              Show {hidden} more
            </Button>
          )}
          {expanded && visible.length > LANE_PREVIEW_COUNT && filter === "all" && (
            <Button size="small" onClick={() => setExpanded(false)} sx={{ marginTop: 1 }}>
              Show fewer
            </Button>
          )}
        </>
      ) : (
        <Typography sx={{ color: "text.disabled", fontSize: "0.8125rem", paddingX: 1, paddingY: 1.5 }}>
          {filter === "all" ? emptyMessage || `No ${label.toLowerCase()} tasks` : `Nothing ${filter} here`}
        </Typography>
      )}
    </Box>
  );
};

const LaneHeader = ({
  label,
  total,
  running,
  shownCount,
  filter,
}: {
  label: string;
  total: number;
  running: number;
  shownCount: number;
  filter: StateFilter;
}) => (
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
    <Typography variant="overline">{label}</Typography>
    {total > 0 && (
      <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", color: "text.disabled", flexShrink: 0 }}>
        {/* Under a filter the lane total is no longer what is on screen, so
            say both rather than letting the count contradict the list. */}
        {filter === "all" ? total : `${shownCount}/${total}`}
      </Typography>
    )}
    {running > 0 && (
      <Tooltip title={`${running} running now`}>
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "success.main",
            flexShrink: 0,
          }}
        />
      </Tooltip>
    )}
    <Box sx={{ flex: "1 1 auto" }} />
  </Box>
);

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
};

/**
 * A plain group of pipelines and jobs - used for the sections that are a
 * place on the page rather than a queue: standalone jobs, and history.
 */
const TaskInfoSet = ({ pipelineIds, taskIds = [], name, noTasksMessage, header }: TaskInfoSetProps) => {
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
          {pipelineIds.map((pipelineId) => (
            <TaskInfo key={pipelineId} pipelineId={pipelineId} />
          ))}
        </Stack>
      ) : (
        <Typography sx={{ color: "text.disabled", fontSize: "0.8125rem", paddingX: 1, paddingY: 1.5 }}>
          {noTasksMessage || `No ${name.toLowerCase()} tasks`}
        </Typography>
      )}
    </Box>
  );
};
