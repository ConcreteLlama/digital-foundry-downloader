import { DfUserInfo } from "df-downloader-common";
import { DfUiError } from "../../utils/error";
import { QueryableState } from "../utils";

export interface DfUserState extends QueryableState {
  loading: boolean;
  error: DfUiError | null;
  userInfo?: DfUserInfo;
  /**
   * True once the first query (success or failure) has settled. Used to tell
   * an initial "we don't know yet" load apart from a later background
   * re-poll (see App.tsx's periodic re-query) - both set `loading` true, but
   * only the former should visually block on a "Checking..." state.
   */
  initialized: boolean;
}
