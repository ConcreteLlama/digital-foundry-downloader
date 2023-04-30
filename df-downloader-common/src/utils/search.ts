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
  matcher: (filter: FILTER, content: CONTENT) => boolean,
  invert: boolean = false
) => {
  const filters = Array.isArray(filter) ? filter : [filter];
  const include: CONTENT[] = [];
  const exclude: CONTENT[] = [];
  contentList.forEach((content) => {
    const matches = filters.some((filter) => matcher(filter, content));
    if (invert ? !matches : matches) {
      include.push(content);
    } else {
      exclude.push(content);
    }
  });
  return { include, exclude };
};

export const filterContentInfos = (
  filterParam: ContentInfoFilter | ContentInfoFilter[],
  contentInfos: DfContentInfo[],
  invert: boolean = false
) => doFilter(filterParam, contentInfos, ContentInfoFilterUtils.matches, invert);

export const filterContentEntries = (
  filterParam: ContentEntryFilter | ContentEntryFilter[],
  contentsEntries: DfContentEntry[],
  invert: boolean = false
) => doFilter(filterParam, contentsEntries, ContentEntryFilterUtils.matches, invert);
