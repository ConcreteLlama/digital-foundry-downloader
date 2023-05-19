import { DfUserInfo } from "df-downloader-common";
import { AppStartListening } from "../listener";
import { queryDfUserInfo } from "./df-user.actions";
import { addFetchListener } from "../utils";
import { API_URL } from "../../config";

export const startListeningDfUserInfo = (startListening: AppStartListening) => {
  addFetchListener(startListening, queryDfUserInfo, DfUserInfo, () => [`${API_URL}/df-user`]);
};
