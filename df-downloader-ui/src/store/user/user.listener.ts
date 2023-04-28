import { UserInfo } from "df-downloader-common";
import { AppStartListening } from "../listener";
import { queryUserInfo } from "./user.actions";
import { addFetchListener } from "../utils";
import { API_URL } from "../../config";

export const startListeningUserInfo = (startListening: AppStartListening) => {
  addFetchListener(startListening, queryUserInfo, UserInfo, () => [`${API_URL}/user`]);
};
