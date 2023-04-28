import {
  ContentEntryFilter,
  ContentEntryFilterUtils,
  ContentInfoFilter,
  ContentInfoFilterUtils,
  DfContentEntry,
  DfContentInfo,
} from "../models/index.js";

const doFilter = <FILTER, CONTENT>(
  filter: FILTER | FILTER[],
  contentList: CONTENT[],
  invert: boolean = false,
  matcher: (filter: FILTER, content: CONTENT) => boolean
) => {
  const filters = Array.isArray(filter) ? filter : [filter];
  return contentList.filter((content) => {
    const matches = filters.some((filter) => matcher(filter, content));
    return invert ? !matches : matches;
  });
};

export const filterContentInfos = (
  filterParam: ContentInfoFilter | ContentInfoFilter[],
  contentInfos: DfContentInfo[],
  invert: boolean = false
) => doFilter(filterParam, contentInfos, invert, ContentInfoFilterUtils.matches);

export const filterContentEntries = (
  filterParam: ContentEntryFilter | ContentEntryFilter[],
  contentsEntries: DfContentEntry[],
  invert: boolean = false
) => doFilter(filterParam, contentsEntries, invert, ContentEntryFilterUtils.matches);
