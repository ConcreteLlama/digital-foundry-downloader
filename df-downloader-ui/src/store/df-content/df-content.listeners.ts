import { DfContentEntry, DfContentEntrySearchResponse } from "df-downloader-common";
import { API_URL } from "../../config";
import { AppStartListening } from "../listener";
import { store } from "../store";
import { addFetchListener } from "../utils";
import {
  fetchSingleDfContentEntry,
  queryDfContent,
  resetDfContentQuery,
  setDfContentQuery,
  updateDfContentQuery,
} from "./df-content.action";

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
  startListening({
    actionCreator: resetDfContentQuery,
    effect: (action, listenerApi) => {
      console.log("reset");
      store.dispatch(queryDfContent.start());
    },
  });
  addFetchListener(startListening, queryDfContent, DfContentEntrySearchResponse, () => {
    const body = store.getState().dfContent.currentQuery;
    let url = `${API_URL}/content/search`;
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
};
