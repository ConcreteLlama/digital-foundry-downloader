import { DfUserInfo } from "df-downloader-common";
import { DfUiError } from "../../utils/error";
import { QueryableState } from "../utils";

export interface DfUserState extends QueryableState {
  loading: boolean;
  error: DfUiError | null;
  userInfo?: DfUserInfo;
}
