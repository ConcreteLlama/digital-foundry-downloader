import { z } from "zod";
import { ContentEntryFilter } from "./filter.js";
import { DfContentEntry, DfContentEntryUtils } from "./df-content-entry.js";
import { filterContentEntries } from "../utils/search.js";
import { secondsToHHMMSS } from "../utils/time-utils.js";

const ContentSort = z.object({
  sortBy: z.enum(["date", "name"]),
  sortDirection: z.enum(["asc", "desc"]),
});
const ContentEntryFilterArray = z
  .union([ContentEntryFilter, ContentEntryFilter.array()])
  .transform((value) => (Array.isArray(value) ? value : [value]));
const ContentFilter = z.object({
  include: ContentEntryFilterArray.optional(),
  exclude: ContentEntryFilterArray.optional(),
});
type ContentFilter = z.infer<typeof ContentFilter>;

export const DfContentEntrySearchBody = z.object({
  page: z.number().default(1),
  limit: z.number().default(100),
  sort: ContentSort.default({
    sortBy: "date",
    sortDirection: "desc",
  }),
  filter: ContentFilter.optional(),
  /**
   * Narrow to content with at least one download on disk.
   *
   * Top-level rather than part of `filter`, because include filters are OR'd
   * against each other - expressed there it would widen the results rather
   * than narrow them, which is the opposite of what it says. Applied after
   * include and exclude, so it always narrows whatever they produced.
   */
  downloadedOnly: z.boolean().optional(),
});
export type DfContentEntrySearchBody = z.infer<typeof DfContentEntrySearchBody>;
export type DfContentEntrySearchBodyInput = z.input<typeof DfContentEntrySearchBody>;
export const DfContentEntrySearchUtils = {
  search: (
    searchParams: DfContentEntrySearchBody,
    dfContentEntries: DfContentEntry[]
  ): DfContentEntrySearchResponse => {
    const { page, limit, filter, sort, downloadedOnly } = searchParams;
    const { sortBy, sortDirection } = sort;
    const { include, exclude } = filter || {};
    dfContentEntries = include ? filterContentEntries(include, dfContentEntries).include : dfContentEntries;
    dfContentEntries = exclude ? filterContentEntries(exclude, dfContentEntries).exclude : dfContentEntries;
    if (downloadedOnly) {
      dfContentEntries = dfContentEntries.filter((entry) => (entry.downloads ?? []).length > 0);
    }
    dfContentEntries = dfContentEntries.sort((a, b) => {
      const aActual = sortDirection === "asc" ? a : b;
      const bActual = sortDirection === "asc" ? b : a;
      if (sortBy === "date") {
        return aActual.contentInfo.publishedDate.getTime() - bActual.contentInfo.publishedDate.getTime();
      } else if (sortBy === "name") {
        return aActual.contentInfo.name.localeCompare(bActual.contentInfo.name);
      }
      return 0;
    });
    const pageIdx = page - 1;
    const start = pageIdx === 0 && limit === Infinity ? 0 : pageIdx * limit;
    const end = start + limit;
    const pageEntries = dfContentEntries.slice(start, end);
    return {
      params: searchParams,
      resultsOnPage: pageEntries.length,
      pageDuration: secondsToHHMMSS(DfContentEntryUtils.getTotalDuration(pageEntries)),
      totalResults: dfContentEntries.length,
      totalDuration: secondsToHHMMSS(DfContentEntryUtils.getTotalDuration(dfContentEntries)),
      content: pageEntries,
    };
  },
};

export const DfContentEntrySearchResponse = z.object({
  params: DfContentEntrySearchBody,
  resultsOnPage: z.number(),
  pageDuration: z.string(),
  totalResults: z.number(),
  totalDuration: z.string(),
  content: z.array(DfContentEntry),
  scanInProgress: z.boolean().optional(),
});
export type DfContentEntrySearchResponse = z.infer<typeof DfContentEntrySearchResponse>;
