import { DfContentBadgeState, DfContentEntry, DfContentEntrySearchBodyInput } from "df-downloader-common";
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
  selectedContent: string[];
  content: Record<string, DfContentEntry>;
  /**
   * Per-item state that is not part of the content itself - whether it has
   * been analysed, and whether an article was matched. Sent alongside the
   * entries by the query, keyed by content key.
   */
  badges: Record<string, DfContentBadgeState>;
  currentQuery: DfContentEntrySearchBodyInput;
  error: DfUiError | null;
}
