import { ServiceInfo } from "df-downloader-common";
import { DfUiError } from "../../utils/error";
import { QueryableState } from "../utils";

export interface ServiceInfoState extends QueryableState {
  loading: boolean;
  error: DfUiError | null;
  serviceInfo?: ServiceInfo;
}
