import { useEffect } from "react";
import { DfContentInfoDirectory } from "../../components/df-content/df-content-directory/df-content-directory.component";
import { queryDfContent } from "../../store/df-content/df-content.action";
import { store } from "../../store/store";
import { setIntervalImmediate } from "../../utils/timer";

export const DfContentPage = () => {
  useEffect(() => {
    const contentInterval = setIntervalImmediate(() => {
      store.dispatch(queryDfContent.start());
    }, 30000);
    return () => {
      clearInterval(contentInterval);
    };
  });
  return <DfContentInfoDirectory/>;
};
