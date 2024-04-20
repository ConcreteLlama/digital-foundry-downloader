import { DfContentEntry, DfContentEntrySearchResponse, DfContentInfoRefreshMetaResponse } from "df-downloader-common";
import { API_URL } from "../../config";
import { AppStartListening } from "../listener";
import { store } from "../store";
import { addFetchListener } from "../utils";
import {
  fetchSingleDfContentEntry,
  queryDfContent,
  refreshDfContentMeta,
  resetDfContentQuery,
  setDfContentQuery,
  updateDfContentQuery,
} from "./df-content.action";

export const startListeningDfContentInfo = (startListening: AppStartListening) => {
  startListening({
    actionCreator: updateDfContentQuery,
    effect: () => {
      store.dispatch(queryDfContent.start());
    },
  });
  startListening({
    actionCreator: setDfContentQuery,
    effect: () => {
      store.dispatch(queryDfContent.start());
    },
  });
  startListening({
    actionCreator: resetDfContentQuery,
    effect: () => {
      store.dispatch(queryDfContent.start());
    },
  });
  // Need to intercept the query df content success state
  startListening({
    actionCreator: queryDfContent.success,
    effect: (action) => {
      if (action.payload.scanInProgress) {
        setTimeout(() => {
          store.dispatch(queryDfContent.start());
        }, 5000);
      }
    },
  });
  addFetchListener(startListening, queryDfContent, DfContentEntrySearchResponse, () => {
    const body = store.getState().dfContent.currentQuery;
    const url = `${API_URL}/content/search`;
    return [
      url,
      {
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        method: "POST",
      },
    ];
  });
  addFetchListener(startListening, fetchSingleDfContentEntry, DfContentEntry, (contentName) => {
    return [`${API_URL}/content/entry/${contentName}`];
  });
  addFetchListener(startListening, refreshDfContentMeta, DfContentInfoRefreshMetaResponse, (contentNames) => {
    return [
      `${API_URL}/content/entry/refresh-metadata`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contentName: contentNames }),
        method: "POST",
      },
    ];
  });
};
