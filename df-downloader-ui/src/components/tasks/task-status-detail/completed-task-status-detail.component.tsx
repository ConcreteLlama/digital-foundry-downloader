import { Box, Stack, Typography } from "@mui/material";
import { useSelector } from "react-redux";
import { selectPipelineErrors, selectPipelineStatus } from "../../../store/df-tasks/tasks.selector.ts";
import { monoFontFamily } from "../../../themes/build-theme.ts";
import { PipelineTrack } from "../pipeline-track/pipeline-track.component.tsx";

export type CompletedTaskStatusDetailProps = {
  pipelineId: string;
};

/**
 * A finished pipeline.
 *
 * Success and cancellation collapse to a single line - they are history, and a
 * full-height card each meant twenty completed downloads buried the two that
 * were still running. A FAILURE keeps its whole track, because the useful
 * question there is which step died and which never ran, and that used to
 * collapse to one error icon at the end of the stepper.
 */
export const CompletedTaskStatusDetail = ({ pipelineId }: CompletedTaskStatusDetailProps) => {
  const pipelineStatus = useSelector(selectPipelineStatus(pipelineId));
  const errors = useSelector(selectPipelineErrors(pipelineId));
  const { pipelineResult, statusMessage } = pipelineStatus ?? {};

  if (pipelineResult === "failed") {
    return (
      <Box sx={{ width: "100%" }}>
        <PipelineTrack pipelineId={pipelineId} />
        <Typography
          sx={{
            fontFamily: monoFontFamily,
            fontSize: "0.6875rem",
            color: "error.main",
            marginTop: 1,
            wordBreak: "break-word",
          }}
        >
          {errors.length ? errors.join(" · ") : "Failed"}
        </Typography>
      </Box>
    );
  }

  return (
    <Stack direction="row" sx={{ width: "100%", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
      <Typography
        noWrap
        sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", color: "text.disabled", minWidth: 0 }}
      >
        {pipelineResult === "cancelled" ? "cancelled" : statusMessage || "completed"}
      </Typography>
    </Stack>
  );
};
