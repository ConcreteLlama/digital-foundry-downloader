import { Grid, GridProps, useMediaQuery } from "@mui/material";
import { bytesToHumanReadable, calculateTimeRemainingSeconds, capitalizeFirstLetter } from "df-downloader-common";
import prettyMilliseconds from "pretty-ms";
import { useSelector } from "react-redux";
import { Fragment } from "react/jsx-runtime";
import {
  selectDownoadingProgressField,
  selectTaskState,
  selectTaskStatusField,
} from "../../../store/df-tasks/tasks.selector.ts";
import { theme } from "../../../themes/theme.ts";
import { EllipsisTooltipText } from "../../general/ellipsis-tooltip-text.component.tsx";
import { TaskControls } from "../task-controls.component.tsx";

const progressBarColours = {
  running: {
    barColour1: theme.palette.primary.main,
    barColour2: theme.palette.primary.light,
  },
  paused: {
    barColour1: "darkgrey",
    barColour2: "grey",
  },
  forceStarted: {
    barColour1: theme.palette.warning.main,
    barColour2: theme.palette.warning.light,
  },
};

type DownloadTaskInfoProps = {
  pipelineId: string;
  stepId: string;
};
export const DownloadTaskStatusDetail = ({ pipelineId, stepId }: DownloadTaskInfoProps) => {
  const percentComplete = useSelector(selectDownoadingProgressField(pipelineId, stepId, "percentComplete"));
  const belowMd = useMediaQuery(theme.breakpoints.down("md"));
  const belowSm = useMediaQuery(theme.breakpoints.down("sm"));
  const taskState = useSelector(selectTaskState(pipelineId, stepId));
  const forceStarted = useSelector(selectTaskStatusField(pipelineId, stepId, "forceStarted"));
  const { barColour1, barColour2 } =
    progressBarColours[taskState === "paused" ? "paused" : forceStarted ? "forceStarted" : "running"];
  const background = `linear-gradient(to right, ${barColour1} ${
    percentComplete / 2
  }%, ${barColour2} ${percentComplete}%, rgba(255, 255, 255, 0.0) ${percentComplete}%)`;
  if (belowMd) {
    return (
      <Grid
        container
        sx={{
          width: "100%",
          background,
        }}
      >
        <Grid item xs={5} container direction="column">
          <StatusDetailGridItem>
            <DownloadedProgressInfo pipelineId={pipelineId} stepId={stepId} label={belowSm ? "D" : "Downloaded"} />
          </StatusDetailGridItem>
          <StatusDetailGridItem>
            <TotalBytesInfo pipelineId={pipelineId} stepId={stepId} label={belowSm ? "T" : "Total"} />
          </StatusDetailGridItem>
        </Grid>
        <Grid item xs={2} container justifyContent="center">
          <StatusDetailGridItem>
            <TaskControls pipelineId={pipelineId} />
          </StatusDetailGridItem>
        </Grid>
        <Grid item xs={5} container direction="column">
          {taskState === "running" ? (
            <Fragment>
              <StatusDetailGridItem>
                <DownloadSpeedInfo pipelineId={pipelineId} stepId={stepId} label={belowSm ? null : "Total"} />
              </StatusDetailGridItem>
              <StatusDetailGridItem>
                <DownloadEtaInfo pipelineId={pipelineId} stepId={stepId} />
              </StatusDetailGridItem>
            </Fragment>
          ) : (
            <StatusDetailGridItem>
              <DownloadStatusDescription pipelineId={pipelineId} stepId={stepId} />
            </StatusDetailGridItem>
          )}
        </Grid>
      </Grid>
    );
  } else {
    return (
      <Grid
        container
        columns={5}
        sx={{
          width: "100%",
          background,
        }}
      >
        <StatusDetailGridItem>
          <DownloadPercentCompleteInfo pipelineId={pipelineId} stepId={stepId} />
        </StatusDetailGridItem>
        <StatusDetailGridItem>
          <DownloadProgressInfo pipelineId={pipelineId} stepId={stepId} />
        </StatusDetailGridItem>
        <StatusDetailGridItem>
          <TaskControls pipelineId={pipelineId} />
        </StatusDetailGridItem>
        {taskState === "running" ? (
          <Fragment>
            <StatusDetailGridItem>
              <DownloadSpeedInfo pipelineId={pipelineId} stepId={stepId} />
            </StatusDetailGridItem>
            <StatusDetailGridItem>
              <DownloadEtaInfo pipelineId={pipelineId} stepId={stepId} />
            </StatusDetailGridItem>
          </Fragment>
        ) : (
          <StatusDetailGridItem xs={4.8}>
            {/*4.8 is a workaround to make the text fit in the grid item, I should maybe consider
              using a different system to MUI grid, but this works for now
            */}
            <DownloadStatusDescription pipelineId={pipelineId} stepId={stepId} />
          </StatusDetailGridItem>
        )}
      </Grid>
    );
  }
};

type StatusDetailGridItemProps = {
  children: React.ReactNode;
} & GridProps;
const StatusDetailGridItem = (props: StatusDetailGridItemProps) => (
  <Grid item xs={props.xs || true} container alignItems="center" justifyContent="center" flexGrow={1}>
    {props.children}
  </Grid>
);

const DownloadPercentCompleteInfo = ({ pipelineId, stepId }: DownloadTaskInfoProps) => {
  const percentComplete = (
    useSelector(selectDownoadingProgressField(pipelineId, stepId, "percentComplete")) || 0
  ).toFixed(2);
  const value = `${percentComplete}%`;
  return <EllipsisTooltipText text={value} />;
};

const DownloadProgressInfo = ({ pipelineId, stepId }: DownloadTaskInfoProps) => {
  const totalBytesDownloaded = useSelector(selectDownoadingProgressField(pipelineId, stepId, "totalBytesDownloaded"));
  const totalBytes = useSelector(selectDownoadingProgressField(pipelineId, stepId, "totalBytes"));
  const value = `${bytesToHumanReadable(totalBytesDownloaded || 0)} / ${bytesToHumanReadable(totalBytes || 0)}`;
  return <EllipsisTooltipText text={value} />;
};

type LabelledTaskInfoProps = {
  label?: string | null;
} & DownloadTaskInfoProps;

const makePrefix = (label: string | null | undefined, defaultLabel: string) =>
  label === null ? "" : `${label || defaultLabel}: `;

const DownloadedProgressInfo = ({ pipelineId, stepId, label }: LabelledTaskInfoProps) => {
  const totalBytesDownloaded = useSelector(selectDownoadingProgressField(pipelineId, stepId, "totalBytesDownloaded"));
  const value = `${makePrefix(label, "Downloaded")}${bytesToHumanReadable(totalBytesDownloaded || 0)}`;
  return <EllipsisTooltipText text={value} />;
};

const TotalBytesInfo = ({ pipelineId, stepId, label }: LabelledTaskInfoProps) => {
  const totalBytes = useSelector(selectDownoadingProgressField(pipelineId, stepId, "totalBytes"));
  const value = `${makePrefix(label, "Total")}${bytesToHumanReadable(totalBytes || 0)}`;
  return <EllipsisTooltipText text={value} />;
};

const DownloadSpeedInfo = ({ pipelineId, stepId, label }: LabelledTaskInfoProps) => {
  const taskState = useSelector(selectTaskState(pipelineId, stepId));
  const currentBytesPerSecond = useSelector(selectDownoadingProgressField(pipelineId, stepId, "currentBytesPerSecond"));
  const value = `${makePrefix(label, "Speed")}${
    taskState === "running" ? `${bytesToHumanReadable(currentBytesPerSecond || 0)}/s` : "N/A"
  }`;
  return <EllipsisTooltipText text={value} />;
};

const DownloadEtaInfo = ({ pipelineId, stepId }: DownloadTaskInfoProps) => {
  const taskState = useSelector(selectTaskState(pipelineId, stepId));
  const currentBytesPerSecond =
    useSelector(selectDownoadingProgressField(pipelineId, stepId, "currentBytesPerSecond")) || 1;
  const totalBytes = useSelector(selectDownoadingProgressField(pipelineId, stepId, "totalBytes")) || 0;
  const totalBytesDownloaded =
    useSelector(selectDownoadingProgressField(pipelineId, stepId, "totalBytesDownloaded")) || 0;
  const timeRemainingInSeconds = calculateTimeRemainingSeconds(totalBytesDownloaded, totalBytes, currentBytesPerSecond);
  const value = `ETA: ${
    taskState === "running" ? prettyMilliseconds(timeRemainingInSeconds * 1000, { secondsDecimalDigits: 0 }) : "N/A"
  }`;
  return <EllipsisTooltipText text={value} />;
};

const DownloadStatusDescription = ({ pipelineId, stepId }: DownloadTaskInfoProps) => {
  const taskState = useSelector(selectTaskState(pipelineId, stepId));
  const message = useSelector(selectTaskStatusField(pipelineId, stepId, "message"));
  const attempt = useSelector(selectTaskStatusField(pipelineId, stepId, "attempt"));
  const pauseTrigger = useSelector(selectTaskStatusField(pipelineId, stepId, "pauseTrigger"));

  const attemptInfo = taskState === "awaiting_retry" ? ` (Attempt ${attempt})` : "";
  const pauseInfo = taskState === "paused" && pauseTrigger ? ` (${capitalizeFirstLetter(pauseTrigger)})` : "";
  const value = `${capitalizeFirstLetter(taskState || "").replace("_", " ")}${attemptInfo}${pauseInfo}${
    message ? `: ${message}` : ""
  }`;
  return <EllipsisTooltipText text={value} />;
};
