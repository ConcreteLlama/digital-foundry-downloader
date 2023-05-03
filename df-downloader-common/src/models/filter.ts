import { z } from "zod";
import { DfContentStatus } from "./df-content-status.js";
import { DfContentInfo } from "./df-content-info.js";
import { DfContentEntry } from "./df-content-entry.js";

export const TagFilter = z.object({
  tags: z.array(z.string()),
  mode: z.enum(["or", "and"]),
  caseSensitive: z.boolean().optional().default(false),
});
export type TagFilter = z.infer<typeof TagFilter>;
export const TagFilterUtils = {
  matches: (tagFilter: TagFilter, tags: string[]): boolean => {
    let filterTags = tagFilter.tags;
    if (!tagFilter.caseSensitive) {
      tags = tags.map((tag) => tag.toLowerCase());
      filterTags = filterTags.map((tag) => tag.toLowerCase());
    }
    if (!tags) {
      return true;
    }
    if (tagFilter.mode === "or") {
      return filterTags.some((tag) => tags.includes(tag));
    } else {
      return filterTags.every((tag) => tags.includes(tag));
    }
  },
};

export const StringFilter = z.object({
  value: z.string().min(1),
  mode: z.enum(["contains", "startsWith"]).default("contains"),
  caseSensitive: z.boolean().optional().default(false),
});
export type StringFilter = z.infer<typeof StringFilter>;

export const StringFilterTransformer = z.union([StringFilter, z.string()]).transform((value) => {
  if (typeof value === "string") {
    return StringFilter.parse({ value });
  }
  return value;
});

export const StringFilterUtils = {
  matches: (stringFilter: StringFilter, value: string): boolean => {
    if (!stringFilter.value) {
      return true;
    }
    const filterValue = stringFilter.caseSensitive ? stringFilter.value : stringFilter.value.toLowerCase();
    value = stringFilter.caseSensitive ? value : value.toLowerCase();
    if (stringFilter.mode === "contains") {
      return value.includes(filterValue);
    } else {
      return value.startsWith(filterValue);
    }
  },
};

export const ContentInfoFilter = z.object({
  tags: TagFilter.optional(),
  title: StringFilterTransformer.optional(),
  description: StringFilterTransformer.optional(),
});
export type ContentInfoFilter = z.infer<typeof ContentInfoFilter>;

export const ContentInfoFilterUtils = {
  matches: (contentSearchFilter: ContentInfoFilter, contentInfo: DfContentInfo): boolean => {
    if (contentSearchFilter.tags) {
      if (!TagFilterUtils.matches(contentSearchFilter.tags, contentInfo.tags || [])) {
        return false;
      }
    }
    if (contentSearchFilter.title) {
      if (!StringFilterUtils.matches(contentSearchFilter.title, contentInfo.title)) {
        return false;
      }
    }
    if (contentSearchFilter.description) {
      if (!StringFilterUtils.matches(contentSearchFilter.description, contentInfo.description || "")) {
        return false;
      }
    }
    return true;
  },
};

export const ContentEntryFilter = ContentInfoFilter.extend({
  status: z.nativeEnum(DfContentStatus).optional(),
});
export type ContentEntryFilter = z.infer<typeof ContentEntryFilter>;

export const ContentEntryFilterUtils = {
  matches: (contentEntryFilter: ContentEntryFilter, contentEntry: DfContentEntry): boolean => {
    if (contentEntryFilter.status && contentEntryFilter.status !== contentEntry.statusInfo.status) {
      return false;
    }
    return ContentInfoFilterUtils.matches(contentEntryFilter, contentEntry.contentInfo);
  },
};
