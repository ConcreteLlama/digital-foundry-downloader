import {
  DfContentInfo,
  DfContentInfoQueryParams,
  DfTagInfo,
  UserInfo,
  DfContentEntry,
  DfContentEntryUtils,
  DfContentStatusInfoUtils,
} from "df-downloader-common";

export const makePaywalledContentInfo = (userTierWhenUnavailable: string, dfContent: DfContentInfo) => {
  return DfContentEntryUtils.create(
    dfContent.name,
    dfContent,
    DfContentStatusInfoUtils.createPaywalled(userTierWhenUnavailable)
  );
};
export const makeAvailableContentInfo = (dfContent: DfContentInfo) => {
  return DfContentEntryUtils.create(dfContent.name, dfContent, DfContentStatusInfoUtils.createAvailable());
};
export const makeDownloadingContentInfo = (dfContent: DfContentInfo) => {
  return DfContentEntryUtils.create(dfContent.name, dfContent, DfContentStatusInfoUtils.createAttemptingDownload());
};
export const makeDownloadedContentInfo = (
  dfContent: DfContentInfo,
  format: string,
  downloadLocation: string,
  size: string | undefined,
  downloadDate: Date
) => {
  return DfContentEntryUtils.create(
    dfContent.name,
    dfContent,
    DfContentStatusInfoUtils.createDownloaded(format, downloadDate, downloadLocation, size)
  );
};

const defaultQueryParams: DfContentInfoQueryParams = {
  limit: Infinity,
  page: 1,
  tagMode: "or",
  sortBy: "date",
  sortDirection: "desc",
};

export type DbInitInfo = {
  firstRun: boolean;
};

export abstract class DfDownloaderOperationalDb {
  abstract init(): Promise<DbInitInfo>; //Returns true if this is first run
  contentDownloaded(
    dfContent: DfContentInfo,
    format: string,
    downloadLocation: string,
    size: string | undefined,
    downloadDate: Date
  ) {
    return this.addContentInfos(makeDownloadedContentInfo(dfContent, format, downloadLocation, size, downloadDate));
  }
  addContents(userTier: string, dfContents: DfContentInfo[]) {
    return this.addContentInfos(
      ...dfContents.map((dfContent) =>
        dfContent.dataPaywalled ? makePaywalledContentInfo(userTier, dfContent) : makeAvailableContentInfo(dfContent)
      )
    );
  }

  addPaywalledContent(userTierWhenUnavailable: string, ...dfContents: DfContentInfo[]) {
    return this.addContentInfos(
      ...dfContents.map((dfContent) => makePaywalledContentInfo(userTierWhenUnavailable, dfContent))
    );
  }
  addAvailableContent(dfContents: DfContentInfo[]) {
    return this.addContentInfos(...dfContents.map((dfContent) => makeAvailableContentInfo(dfContent)));
  }
  addDownloadingContents(dfContents: DfContentInfo[]) {
    return this.addContentInfos(...dfContents.map((dfContent) => makeDownloadingContentInfo(dfContent)));
  }
  public abstract addContentInfos(...contentInfos: DfContentEntry[]): Promise<void>;
  abstract getContentEntryList(contentNames: string[]): Promise<(DfContentEntry | undefined)[]>;
  abstract getContentInfoMap(contentNames: string[]): Promise<Map<string, DfContentEntry>>;
  abstract getAllContentEntries(): Promise<DfContentEntry[]>;
  abstract getContentEntry(contentName: string): Promise<DfContentEntry | undefined>;
  removeContentInfo(contentName: string): Promise<void> {
    return this.removeContentInfos([contentName]);
  }
  async getMostRecentContentInfo() {
    const allContentEntries = await this.getAllContentEntries();
    if (allContentEntries.length === 0) {
      return undefined;
    }
    return allContentEntries.sort((a, b) => {
      return b.contentInfo.publishedDate.getTime() - a.contentInfo.publishedDate.getTime();
    })[0];
  }
  async getAllTags(): Promise<DfTagInfo[]> {
    const allContentEntries = await this.getAllContentEntries();
    const tagMap = new Map<string, number>();
    allContentEntries.forEach((contentEntry) => {
      contentEntry.contentInfo.tags?.forEach((tag) => {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      });
    });
    return Array.from(tagMap, ([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }
  async query(params: Partial<DfContentInfoQueryParams>) {
    params = Object.fromEntries(Object.entries(params).filter(([k, v]) => v));
    params = {
      ...defaultQueryParams,
      ...params,
    };
    let { page, limit, search, tags, tagMode, status, sortBy, sortDirection } = params as DfContentInfoQueryParams;
    tags = tags?.map((tag) => tag.toLowerCase());
    search = search?.toLowerCase();
    const allContentEntries = await this.getAllContentEntries();
    const filtered =
      search || tags || status
        ? allContentEntries.filter((contentEntry) => {
            if (search) {
              if (!contentEntry.contentInfo.title.toLowerCase().includes(search)) {
                return false;
              }
            }
            if (tags) {
              const lowerTags = contentEntry.contentInfo.tags?.map((tag) => tag.toLowerCase());
              if (tagMode !== "and") {
                if (!lowerTags?.find((tag) => tags!.includes(tag))) {
                  return false;
                }
              } else {
                if (!lowerTags) {
                  return false;
                }
                for (const tag of tags) {
                  if (!lowerTags.includes(tag)) {
                    return false;
                  }
                }
              }
            }
            if (status) {
              if (!status.includes(contentEntry.statusInfo.status)) {
                return false;
              }
            }
            return true;
          })
        : allContentEntries;
    const pageIdx = page - 1;
    const start = pageIdx === 0 && limit === Infinity ? 0 : pageIdx * limit;
    const sorted = filtered.sort((a, b) => {
      let compareResult;
      if (sortBy === "date") {
        compareResult = a.contentInfo.publishedDate.getTime() - b.contentInfo.publishedDate.getTime();
      } else {
        compareResult = a.contentInfo.title.localeCompare(b.contentInfo.title);
      }
      return sortDirection === "asc" ? compareResult : compareResult * -1;
    });
    return {
      params,
      totalResults: sorted.length,
      totalDurationSeconds: DfContentEntryUtils.getTotalDuration(filtered),
      queryResult: sorted.slice(start, start + limit),
    };
  }
  abstract removeContentInfos(contentNames: string[]): Promise<void>;
  abstract setUserInfo(user?: UserInfo): Promise<void>;
  abstract getUserInfo(): Promise<UserInfo | undefined>;
  abstract setFirstRunComplete(): Promise<void>;
}
