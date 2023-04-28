import { queryConfigSection, updateConfigSection } from "./config.action";
import { AppStartListening } from "../listener";
import { fetchJson } from "../../utils/fetch";
import { ensureDfUiError } from "../../utils/error";
import { parseResponseBody } from "df-downloader-common";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config";
import { API_URL } from "../../config";

export const startListeneingConfig = (listener: AppStartListening) => {
  listener({
    actionCreator: queryConfigSection.start,
    effect: async (action, listenerApi) => {
      const section = action.payload;
      try {
        console.log("querying config section", section);
        let url = `${API_URL}/config/${section}`;
        const data = await fetchJson(url);
        console.log("raw data is", data);
        const result = parseResponseBody(data, DfDownloaderConfig.shape[section]);
        console.log("got data", data);
        if (result.data) {
          listenerApi.dispatch(
            queryConfigSection.success({
              section: section,
              value: result.data,
            })
          );
        } else {
          listenerApi.dispatch(queryConfigSection.failed(ensureDfUiError(result.error)));
        }
      } catch (e) {
        listenerApi.dispatch(queryConfigSection.failed(ensureDfUiError(e)));
      }
    },
  });
  listener({
    actionCreator: updateConfigSection.start,
    effect: async (action, listenerApi) => {
      try {
        const section = action.payload.section;
        const url = `${API_URL}/config/${section}`;
        console.log("sending", action.payload, "to", url);
        const data = await fetchJson(url, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(action.payload.value),
        });
        const result = parseResponseBody(data, DfDownloaderConfig.shape[section]);
        console.log("Got data after PUT", data);
        if (result.data) {
          listenerApi.dispatch(
            updateConfigSection.success({
              section: action.payload.section,
              value: result.data,
            })
          );
        } else {
          listenerApi.dispatch(queryConfigSection.failed(ensureDfUiError(result.error)));
        }
      } catch (e) {
        console.log("error!", e);
        listenerApi.dispatch(updateConfigSection.failed(ensureDfUiError(e)));
      }
    },
  });
};
