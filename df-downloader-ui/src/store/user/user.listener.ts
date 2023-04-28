import { UserInfo } from "df-downloader-common";
import { AppStartListening } from "../listener";
import { queryUserInfo } from "./user.actions";
import { addFetchListener } from "../utils";

export const startListeningUserInfo = (startListening: AppStartListening) => {
  addFetchListener(startListening, queryUserInfo, UserInfo, () => ["http://127.0.0.1:44556/api/user"]);
};
