import { QueuedContent } from "df-downloader-common";
import { LinearProgressWithLabel } from "../general/linear-progress-with-label.component";

export type DfDownloadProgressBarProps = {
  queuedContent: QueuedContent;
};

export const DfDownloadProgressBar = ({ queuedContent }: DfDownloadProgressBarProps) => {
  return (
    <LinearProgressWithLabel
      variant="determinate"
      value={(queuedContent.currentProgress?.percentComplete || 0) * 100}
    />
  );
};
