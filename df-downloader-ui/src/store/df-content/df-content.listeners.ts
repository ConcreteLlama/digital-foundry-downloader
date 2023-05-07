import { DfContentEntry, DfContentQueryResponse } from "df-downloader-common";
import { AppStartListening } from "../listener";
import { store } from "../store";
import {
  fetchSingleDfContentEntry,
  queryDfContent,
  setDfContentQuery,
  updateDfContentQuery,
} from "./df-content.action";
import { objToUrlParams } from "./df-content.utils";
import { addFetchListener } from "../utils";
import { API_URL } from "../../config";

export const startListeningDfContentInfo = (startListening: AppStartListening) => {
  startListening({
    actionCreator: updateDfContentQuery,
    effect: (action, listenerApi) => {
      store.dispatch(queryDfContent.start());
    },
  });
  startListening({
    actionCreator: setDfContentQuery,
    effect: (action, listenerApi) => {
      store.dispatch(queryDfContent.start());
    },
  });
  addFetchListener(startListening, queryDfContent, DfContentQueryResponse, () => {
    const params = objToUrlParams(store.getState().dfContent.currentQuery);
    let url = `${API_URL}/content/query`;
    const urlQuery = params.toString();
    if (urlQuery.length) {
      url = `${url}?${params.toString()}`;
    }
    return [url];
  });
  addFetchListener(startListening, fetchSingleDfContentEntry, DfContentEntry, (contentName) => {
    return [`${API_URL}/content/entry/${contentName}`];
  });
};
