import CloseIcon from "@mui/icons-material/Close";
import { Dialog, DialogContent, DialogTitle, IconButton, Typography } from "@mui/material";
import { TaskInfo, formatDurationMs } from "df-downloader-common";
import { StepDetailPanel } from "./step-detail-panel.component";
import { TaskOutputFields } from "./task-output-fields.component";

export type StepDetailDialogProps = {
  open: boolean;
  onClose: () => void;
  stepName?: string;
  /** When set, the dialog is about this part of the step rather than the step. */
  phaseName?: string;
  task?: TaskInfo | null;
  progress?: { percent: number; detail?: string; remainingMs?: number };
};

/**
 * One step, in full.
 *
 * Opened by clicking a step or one of its parts. A dialog rather than a row
 * that expands in place, because what a step has to say is variable in size
 * and occasionally large - and hiding table rows behind a toggle made the
 * common case worse to read in order to make room for an uncommon one.
 *
 * Deliberately roomy and deliberately generic: this is where a phase's actual
 * output belongs once it is worth carrying, and nothing here knows what kind
 * of task produced any of it.
 */
export const StepDetailDialog = ({ open, onClose, stepName, phaseName, task, progress }: StepDetailDialogProps) => {
  /*
   * Scoped to whatever was clicked.
   *
   * Clicking a part of a step and being shown the whole step again is not a
   * drill-down, it is the same view in a smaller box. A part gets its own
   * timings and its own output; the step gets its parts listed.
   */
  const phase = phaseName ? task?.status?.phases?.find((candidate) => candidate.name === phaseName) : undefined;
  const elapsed =
    phase?.startedAt &&
    formatDurationMs(
      (phase.endedAt ? new Date(phase.endedAt).getTime() : Date.now()) - new Date(phase.startedAt).getTime(),
      { coarse: true }
    );
  return (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle sx={{ paddingRight: 6 }}>
      <Typography variant="h6">{phase?.name ?? stepName ?? "Step"}</Typography>
      {phase && (
        // The step it belongs to, so a part opened from a long list still says
        // where it came from.
        <Typography variant="caption" color="text.secondary">
          {stepName}
          {phase.state ? ` · ${phase.state}` : ""}
          {elapsed ? ` · ${elapsed}` : ""}
        </Typography>
      )}
      <IconButton
        aria-label="Close step detail"
        onClick={onClose}
        sx={{ position: "absolute", right: 8, top: 8 }}
        size="small"
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </DialogTitle>
    <DialogContent dividers>
      {phase ? (
        phase.output?.length ? (
          <TaskOutputFields fields={phase.output} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            {phase.detail ?? "Nothing to show for this part yet."}
          </Typography>
        )
      ) : task ? (
        <StepDetailPanel task={task} progress={progress} />
      ) : (
        <Typography variant="body2" color="text.secondary">
          This step has not run yet.
        </Typography>
      )}
    </DialogContent>
  </Dialog>
  );
};
