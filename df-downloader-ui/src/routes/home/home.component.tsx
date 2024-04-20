import { useEffect } from "react";
import { DfContentInfoDirectory } from "../../components/df-content/df-content-directory/df-content-directory.component";
import { queryDfContent } from "../../store/df-content/df-content.action";
import { store } from "../../store/store";
import { setIntervalImmediate } from "../../utils/timer";
import { queryTasks } from "../../store/df-tasks/tasks.action";

export const DfContentPage = () => {
  useEffect(() => {
    const downloadQueueInterval = setIntervalImmediate(() => {
      store.dispatch(queryTasks.start());
    }, 1000);
    const contentInterval = setIntervalImmediate(() => {
      store.dispatch(queryDfContent.start());
    }, 30000);
    return () => {
      clearInterval(downloadQueueInterval);
      clearInterval(contentInterval);
    };
  });
  return <DfContentInfoDirectory />;
};
