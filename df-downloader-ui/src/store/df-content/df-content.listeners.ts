import { DfContentEntry, DfContentQueryResponse } from "df-downloader-common";
import { AppStartListening } from "../listener";
import { store } from "../store";
import {
  fetchSingleDfContentInfo,
  queryDfContentInfo,
  setDfContentInfoQuery,
  updateDfContentInfoQuery,
} from "./df-content.action";
import { objToUrlParams } from "./df-content.utils";
import { addFetchListener } from "../utils";
import { API_URL } from "../../config";

export const startListeningDfContentInfo = (startListening: AppStartListening) => {
  startListening({
    actionCreator: updateDfContentInfoQuery,
    effect: (action, listenerApi) => {
      store.dispatch(queryDfContentInfo.start());
    },
  });
  startListening({
    actionCreator: setDfContentInfoQuery,
    effect: (action, listenerApi) => {
      store.dispatch(queryDfContentInfo.start());
    },
  });
  addFetchListener(startListening, queryDfContentInfo, DfContentQueryResponse, () => {
    const params = objToUrlParams(store.getState().dfContent.currentQuery);
    let url = `${API_URL}/content/query`;
    const urlQuery = params.toString();
    if (urlQuery.length) {
      url = `${url}?${params.toString()}`;
    }
    return [url];
  });
  addFetchListener(startListening, fetchSingleDfContentInfo, DfContentEntry, (contentName) => {
    return [`${API_URL}/content/entry/${contentName}`];
  });
};
