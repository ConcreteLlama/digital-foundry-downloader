import CloseIcon from "@mui/icons-material/Close";
import { Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from "@mui/material";
import { TaskInfo } from "df-downloader-common";
import { StepDetailPanel } from "./step-detail-panel.component";

export type StepDetailDialogProps = {
  open: boolean;
  onClose: () => void;
  stepName?: string;
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
export const StepDetailDialog = ({ open, onClose, stepName, task, progress }: StepDetailDialogProps) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle sx={{ paddingRight: 6 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {stepName ?? "Step"}
        </Typography>
      </Stack>
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
      {task ? (
        <StepDetailPanel task={task} progress={progress} />
      ) : (
        <Typography variant="body2" color="text.secondary">
          This step has not run yet.
        </Typography>
      )}
    </DialogContent>
  </Dialog>
);
