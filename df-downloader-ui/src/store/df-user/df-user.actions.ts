import { DfUserInfo } from "df-downloader-common";
import { createQueryActions } from "../utils";

export const queryDfUserInfo = createQueryActions<void, DfUserInfo>("dfUserInfo", "QUERY_USER_INFO");
