import { DfTagInfo } from "df-downloader-common";
import { QueryableState } from "../utils";
import { DfUiError } from "../../utils/error";

export interface DfTagsState extends QueryableState {
  loading: boolean;
  // These get turned into concrete classes in the selectors (classes are non-serializable)
  tags: DfTagInfo[];
  error: DfUiError | null;
}

export type DfTagsResponse = {
  tags: DfTagInfo[];
};
