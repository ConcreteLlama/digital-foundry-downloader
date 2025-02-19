import { z } from "zod";
import { DfContentAvailability } from "./df-content-status.js";
import { DfContentEntry } from "./df-content-entry.js";

export const DfContentInfoQueryParams = z.object({
  search: z.string().optional(),
  page: z.number(),
  limit: z.number(),
  availability: z.array(z.nativeEnum(DfContentAvailability)).optional(),
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

export const DfContentInfoRefreshMetaRequest = z.object({
  contentName: z.union([z.string(), z.array(z.string())]).transform((value) => {
    return Array.isArray(value) ? value : [value];
  }),
});
export type DfContentInfoRefreshMetaRequest = z.infer<typeof DfContentInfoRefreshMetaRequest>;

export const DfContentInfoRefreshMetaResponse = z.object({
  contentEntries: z.array(DfContentEntry),
});
export type DfContentInfoRefreshMetaResponse = z.infer<typeof DfContentInfoRefreshMetaResponse>;