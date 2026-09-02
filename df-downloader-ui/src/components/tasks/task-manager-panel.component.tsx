import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { Box, Chip, Collapse, Stack, Tooltip, Typography } from "@mui/material";
import { LocalComputeStatus, TaskManagerStatus } from "df-downloader-common";
import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { selectLocalCompute, selectTaskManagers } from "../../store/df-tasks/tasks.selector.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";

/**
 * What each queue is doing, as opposed to what each task is doing.
 *
 * The work is spread over a manager per concern, each with its own limit, and
 * none of that was visible anywhere - so a subtitles queue running two jobs
 * under a one-at-a-time limit looked like two ordinary rows rather than an
 * impossibility. Reading a limit against what is actually running is the whole
 * point, which is why "2/1" is called out rather than merely displayed.
 *
 * It is also the only place a paused queue is visible: "pause all" holds the
 * managers, which marks no individual task as held, so nothing in the task
 * list changes appearance at all.
 */

const isBusy = (manager: TaskManagerStatus) =>
  manager.running > 0 || manager.queued > 0 || manager.held > 0 || manager.queueHeld;

const overLimit = (manager: TaskManagerStatus) => manager.running > manager.concurrentTasks;

const ManagerRow = ({ manager }: { manager: TaskManagerStatus }) => {
  const over = overLimit(manager);
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 1,
        paddingY: 0.35,
        paddingX: 1,
        borderRadius: 1,
        opacity: isBusy(manager) ? 1 : 0.5,
        backgroundColor: manager.queueHeld ? "action.hover" : "transparent",
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {manager.label}
        </Typography>
        {manager.queueHeld && (
          <Tooltip title="This queue is paused, so nothing new will start here. Work already running carries on.">
            <Chip label="paused" size="small" color="warning" variant="outlined" sx={{ height: 18 }} />
          </Tooltip>
        )}
      </Stack>

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ fontFamily: monoFontFamily, fontSize: 13 }}>
        <Tooltip
          title={
            over
              ? "More is running than this queue's limit allows. A force-started download may exceed it deliberately; anything else is a bug."
              : "Running now, against this queue's limit."
          }
        >
          <Box component="span" sx={{ color: over ? "warning.main" : "text.primary", fontWeight: over ? 600 : 400 }}>
            {manager.running}/{manager.concurrentTasks}
          </Box>
        </Tooltip>
        <Tooltip title="Waiting its turn in this queue.">
          <Box component="span" sx={{ opacity: manager.queued ? 0.8 : 0.35 }}>
            {manager.queued} queued
          </Box>
        </Tooltip>
        {manager.held > 0 && (
          <Tooltip title="Held out of this queue by hand.">
            <Box component="span" sx={{ opacity: 0.8 }}>
              {manager.held} held
            </Box>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
};

/**
 * Who currently holds the machine.
 *
 * Only rendered when it has something to say. An analysis waiting here still
 * reports itself as running, so without this it looks like a hang rather than
 * like the protection working.
 */
const LocalComputeRow = ({ status }: { status: LocalComputeStatus }) => {
  const parts: string[] = [];
  if (status.transcriptionsRunning > 0) {
    parts.push(`${status.transcriptionsRunning} transcription${status.transcriptionsRunning === 1 ? "" : "s"} running`);
  }
  if (status.analysisHoldingMachine) {
    parts.push("an analysis has the machine");
  }
  if (status.analysesWaiting > 0) {
    parts.push(`${status.analysesWaiting} analys${status.analysesWaiting === 1 ? "is" : "es"} waiting for it`);
  }
  if (!parts.length) {
    return null;
  }
  return (
    <Tooltip title="Transcription and local analysis cannot run at the same time, so an analysis waits for the machine to be free. A waiting analysis still shows as running on its own card.">
      <Typography variant="caption" sx={{ paddingX: 1, opacity: 0.75 }}>
        Local machine: {parts.join(", ")}
      </Typography>
    </Tooltip>
  );
};

export const TaskManagerPanel = () => {
  const managers = useSelector(selectTaskManagers);
  const localCompute = useSelector(selectLocalCompute);
  const [showIdle, setShowIdle] = useState(false);

  const { busy, idle } = useMemo(
    () => ({
      busy: managers.filter(isBusy),
      idle: managers.filter((manager) => !isBusy(manager)),
    }),
    [managers]
  );

  if (!managers.length) {
    return null;
  }

  const pausedCount = managers.filter((manager) => manager.queueHeld).length;

  return (
    <Box sx={{ paddingX: 1, paddingBottom: 1 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ marginBottom: 0.5 }}>
        <Typography variant="overline" sx={{ opacity: 0.7 }}>
          Queues
        </Typography>
        {pausedCount > 0 && (
          <Chip
            label={pausedCount === managers.length ? "all paused" : `${pausedCount} paused`}
            size="small"
            color="warning"
            sx={{ height: 18 }}
          />
        )}
      </Stack>

      <Stack spacing={0.25}>
        {busy.map((manager) => (
          <ManagerRow key={manager.label} manager={manager} />
        ))}
      </Stack>

      <LocalComputeRow status={localCompute} />

      {idle.length > 0 && (
        <>
          <Box
            component="button"
            onClick={() => setShowIdle((current) => !current)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              marginTop: 0.5,
              paddingX: 1,
              paddingY: 0.25,
              background: "none",
              border: "none",
              color: "text.secondary",
              cursor: "pointer",
              font: "inherit",
              fontSize: 12,
            }}
          >
            {showIdle ? <ExpandLess fontSize="inherit" /> : <ExpandMore fontSize="inherit" />}
            {showIdle ? "Hide" : `${idle.length} idle`}
          </Box>
          <Collapse in={showIdle}>
            <Stack spacing={0.25}>
              {idle.map((manager) => (
                <ManagerRow key={manager.label} manager={manager} />
              ))}
            </Stack>
          </Collapse>
        </>
      )}
    </Box>
  );
};
