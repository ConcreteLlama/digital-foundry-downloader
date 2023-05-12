import { z } from "zod";
import { DfContentStatus } from "./df-content-status.js";
import { DfContentInfo } from "./df-content-info.js";
import { DfContentEntry } from "./df-content-entry.js";

export const TagFilter = z.object({
  tags: z.array(z.string()).optional().default([]),
  mode: z.enum(["or", "and"]).optional().default("or"),
  caseSensitive: z.boolean().optional().default(false),
});
export type TagFilter = z.infer<typeof TagFilter>;
export const TagFilterTransformer = z.union([TagFilter, z.string().array()]).transform((value) => {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return undefined;
    }
    return {
      tags: value,
      mode: "or" as "or" | "and",
      caseSensitive: false,
    };
  }
  if (!value.tags?.length) {
    return undefined;
  }
  return value;
});
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
  value: z.string().optional().default(""),
  mode: z.enum(["contains", "startsWith"]).default("contains"),
  caseSensitive: z.boolean().optional().default(false),
});
export type StringFilter = z.infer<typeof StringFilter>;

export const StringFilterTransformer = z.union([StringFilter, z.string()]).transform((value) => {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    value = value.trim();
    if (value.length === 0) {
      return undefined;
    }
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
  tags: TagFilterTransformer.optional(),
  title: StringFilterTransformer.optional(),
  description: StringFilterTransformer.optional(),
});
export type ContentInfoFilter = z.infer<typeof ContentInfoFilter>;

export const ContentInfoFilterUtils = {
  matches: (contentSearchFilter: ContentInfoFilter, contentInfo: DfContentInfo): boolean => {
    if (contentSearchFilter.tags?.tags?.length) {
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
const ContentStatusArrayEnum = z
  .union([z.nativeEnum(DfContentStatus), z.nativeEnum(DfContentStatus).array()])
  .refine((value) => (Array.isArray(value) ? value : [value]));

export const ContentEntryFilter = ContentInfoFilter.extend({
  status: ContentStatusArrayEnum.optional(),
});
export type ContentEntryFilter = z.infer<typeof ContentEntryFilter>;

export const ContentEntryFilterUtils = {
  matches: (contentEntryFilter: ContentEntryFilter, contentEntry: DfContentEntry): boolean => {
    if (contentEntryFilter.status && !contentEntryFilter.status.includes(contentEntry.statusInfo.status)) {
      return false;
    }
    return ContentInfoFilterUtils.matches(contentEntryFilter, contentEntry.contentInfo);
  },
};
