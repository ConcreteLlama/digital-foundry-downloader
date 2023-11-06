import { z } from "zod";
import { DfContentStatus } from "./df-content-status.js";
import { DfContentEntry } from "./df-content-entry.js";

export const DfContentInfoQueryParams = z.object({
  search: z.string().optional(),
  page: z.number(),
  limit: z.number(),
  status: z.array(z.nativeEnum(DfContentStatus)).optional(),
  tags: z.array(z.string()).optional(),
  tagMode: z.enum(["or", "and"]),
  sortBy: z.enum(["date", "name"]),
  sortDirection: z.enum(["asc", "desc"]),
});
export type DfContentInfoQueryParams = z.infer<typeof DfContentInfoQueryParams>;

export const DfContentQueryResponse = z.object({
  params: DfContentInfoQueryParams.partial(),
  resultsOnPage: z.number(),
  pageDuration: z.string(),
  totalResults: z.number(),
  totalDuration: z.string(),
  content: z.array(DfContentEntry),
  scanInProgress: z.boolean().optional(),
});
export type DfContentQueryResponse = z.infer<typeof DfContentQueryResponse>;
