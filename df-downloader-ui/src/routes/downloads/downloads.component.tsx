import { useEffect } from "react";
import { DownloadQueue } from "../../components/downloads/download-queue.component";
import { queryDownloadQueue } from "../../store/download-queue/download-queue.action";
import { store } from "../../store/store";
import { setIntervalImmediate } from "../../utils/timer";
import { DownloadsPageContainer } from "./downloads.styles";

export const DownloadsPage = () => {
  useEffect(() => {
    const interval = setIntervalImmediate(() => {
      store.dispatch(queryDownloadQueue.start);
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  });
  return (
    <DownloadsPageContainer>
      <DownloadQueue />
    </DownloadsPageContainer>
  );
};
