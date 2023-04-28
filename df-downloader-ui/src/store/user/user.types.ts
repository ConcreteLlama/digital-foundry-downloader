import { UserInfo } from "df-downloader-common";
import { DfUiError } from "../../utils/error";

export type UserState = {
  loading: boolean;
  error: DfUiError | null;
  userInfo?: UserInfo;
};
