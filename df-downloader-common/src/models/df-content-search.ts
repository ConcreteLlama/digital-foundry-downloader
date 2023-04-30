import { z } from "zod";
import { ContentEntryFilter } from "./filter.js";
import { DfContentEntry, DfContentEntryUtils } from "./df-content-entry.js";
import { filterContentEntries } from "../utils/search.js";
import { secondsToHHMMSS } from "../utils/time-utils.js";

const ContentSort = z.object({
  sortBy: z.enum(["date", "name"]),
  sortDirection: z.enum(["asc", "desc"]),
});
const ContentFilter = z.object({
  include: z.array(ContentEntryFilter).optional(),
  exclude: z.array(ContentEntryFilter).optional(),
});

export const DfContentEntrySearchBody = z.object({
  page: z.number().default(1),
  limit: z.number().default(100),
  sort: ContentSort.default({
    sortBy: "date",
    sortDirection: "desc",
  }),
  filter: ContentFilter.optional(),
});
export type DfContentEntrySearchBody = z.infer<typeof DfContentEntrySearchBody>;
export const DfContentEntrySearchUtils = {
  search: (
    searchParams: DfContentEntrySearchBody,
    dfContentEntries: DfContentEntry[]
  ): DfContentEntrySearchResponse => {
    const { page, limit, filter, sort } = searchParams;
    const { sortBy, sortDirection } = sort;
    const { include, exclude } = filter || {};
    dfContentEntries = include ? filterContentEntries(include, dfContentEntries).include : dfContentEntries;
    dfContentEntries = exclude ? filterContentEntries(exclude, dfContentEntries).exclude : dfContentEntries;
    dfContentEntries = dfContentEntries.sort((a, b) => {
      const aActual = sortDirection === "asc" ? a : b;
      const bActual = sortDirection === "asc" ? b : a;
      if (sortBy === "date") {
        return aActual.contentInfo.publishedDate.getTime() - bActual.contentInfo.publishedDate.getTime();
      } else if (sortBy === "name") {
        return aActual.name.localeCompare(bActual.name);
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
});
export type DfContentEntrySearchResponse = z.infer<typeof DfContentEntrySearchResponse>;
