import { useEffect } from "react";
import { DfContentInfoDirectory } from "../../components/df-content/df-content-directory.component";
import { queryDfContent } from "../../store/df-content/df-content.action";
import { queryDownloadQueue } from "../../store/download-queue/download-queue.action";
import { store } from "../../store/store";
import { setIntervalImmediate } from "../../utils/timer";

export const HomePage = () => {
  useEffect(() => {
    const downloadQueueInterval = setIntervalImmediate(() => {
      store.dispatch(queryDownloadQueue.start());
    }, 1000);
    const contentInterval = setIntervalImmediate(() => {
      store.dispatch(queryDfContent.start());
    }, 30000);
    return () => {
      clearInterval(downloadQueueInterval);
      clearInterval(contentInterval);
    };
  }, []);
  return <DfContentInfoDirectory />;
};
