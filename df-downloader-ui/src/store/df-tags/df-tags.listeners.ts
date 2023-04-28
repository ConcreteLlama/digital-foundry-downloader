import { API_URL } from "../../config";
import { AppStartListening } from "../listener";
import { addFetchListener } from "../utils";
import { queryDfTags } from "./df-tags.action";
import { DfTagsResponse } from "df-downloader-common";

export const startListeningDfTags = (startListening: AppStartListening) => {
  addFetchListener(startListening, queryDfTags, DfTagsResponse, () => [`${API_URL}/content/tags`]);
};
