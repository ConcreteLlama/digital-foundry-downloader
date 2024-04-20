import { DownloadProgressInfo } from "df-downloader-common";
import { ProgressBar } from "../general/progress-bar.component";

export type DfDownloadProgressBarProps = {
  progressInfo?: DownloadProgressInfo;
};

export const DfDownloadProgressBar = ({ progressInfo }: DfDownloadProgressBarProps) => {
  return <ProgressBar percentComplete={progressInfo?.percentComplete || 0} />;
};
