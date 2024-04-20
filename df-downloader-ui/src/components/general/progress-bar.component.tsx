import { LinearProgressWithLabel } from "../general/linear-progress-with-label.component";

export type ProgressBarProps = {
  percentComplete?: number;
};

export const ProgressBar = ({ percentComplete }: ProgressBarProps) => {
  return <LinearProgressWithLabel variant="determinate" value={percentComplete || 0} />;
};
