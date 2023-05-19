import { User } from "df-downloader-common";
import { DfUiError } from "../../utils/error";

export type AuthUserState = {
  user: User | null;
  loading: boolean;
  error: DfUiError | null;
  loginError: any;
  canRegister: boolean;
};
