import { DfContentEntry, DfContentEntrySearchBodyInput } from "df-downloader-common";
import { QueryableState } from "../utils";
import { DfUiError } from "../../utils/error";

export const DefaultContentQuery: DfContentEntrySearchBodyInput = {
  page: 1,
  limit: 100,
  sort: {
    sortBy: "date",
    sortDirection: "desc",
  },
};

export interface DfContentInfoState extends QueryableState {
  loading: boolean;
  totalItems: number;
  // These get turned into concrete classes in the selectors (classes are non-serializable)
  content: DfContentEntry[];
  currentQuery: DfContentEntrySearchBodyInput;
  error: DfUiError | null;
}
