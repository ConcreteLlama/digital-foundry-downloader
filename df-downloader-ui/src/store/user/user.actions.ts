import { UserInfo } from "df-downloader-common";
import { createQueryActions } from "../utils";

export const queryUserInfo = createQueryActions<void, UserInfo>("userInfo", "QUERY_USER_INFO");
