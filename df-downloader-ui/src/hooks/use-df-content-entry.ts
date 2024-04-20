import { useSelector } from "react-redux";
import { selectDfContentInfoItem } from "../store/df-content/df-content.selector.ts";
import { useEffect } from "react";
import { fetchSingleDfContentEntry } from "../store/df-content/df-content.action.ts";
import { store } from "../store/store.ts";

export const useDfContentEntry = (dfContentName: string) => {
  const dfContentEntry = useSelector(selectDfContentInfoItem(dfContentName));
  useEffect(() => {
    if (!dfContentEntry) {
      store.dispatch(fetchSingleDfContentEntry.start(dfContentName));
    }
  }, [dfContentName, dfContentEntry]);
  return dfContentEntry;
};
