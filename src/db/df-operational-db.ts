import { plainToInstance } from "class-transformer";
import {
  ContentInfoStatus,
  DfContent,
  DfContentInfo,
  DownloadedContentInfo,
  PaywalledContentInfo,
  UserInfo,
} from "../df-types.js";

export const makePaywalledContentInfo = (userTierWhenUnavailable: string, dfContent: DfContent) => {
  return plainToInstance(PaywalledContentInfo, {
    name: dfContent.name,
    userTierWhenUnavailable,
    status: "CONTENT_PAYWALLED",
    meta: dfContent,
  });
};
export const makeAvailableContentInfo = (dfContent: DfContent) => {
  return plainToInstance(DfContentInfo, {
    name: dfContent.name,
    meta: dfContent,
    status: "AVAILABLE",
  });
};
export const makeDownloadedContentInfo = (
  dfContent: DfContent,
  format: string,
  downloadLocation: string,
  size: string | undefined,
  downloadDate: Date
) => {
  return plainToInstance(DownloadedContentInfo, {
    name: dfContent.name,
    meta: dfContent,
    status: "DOWNLOADED",
    format,
    downloadLocation,
    downloadDate,
    size,
  });
};

export type DbQueryParams = {
  search?: string;
  page: number;
  limit: number;
  status?: ContentInfoStatus[];
  tags?: string[];
};

const defaultQueryParams: DbQueryParams = {
  limit: Infinity,
  page: 0,
};

export abstract class DfDownloaderOperationalDb {
  abstract init(): Promise<boolean>; //Returns true if this is first run
  contentDownloaded(
    dfContent: DfContent,
    format: string,
    downloadLocation: string,
    size: string | undefined,
    downloadDate: Date
  ) {
    return this.addContentInfos(makeDownloadedContentInfo(dfContent, format, downloadLocation, size, downloadDate));
  }
  addContents(userTier: string, dfContents: DfContent[]) {
    return this.addContentInfos(
      ...dfContents.map((dfContent) =>
        dfContent.dataPaywalled ? makePaywalledContentInfo(userTier, dfContent) : makeAvailableContentInfo(dfContent)
      )
    );
  }

  addPaywalledContent(userTierWhenUnavailable: string, ...dfContents: DfContent[]) {
    return this.addContentInfos(
      ...dfContents.map((dfContent) => makePaywalledContentInfo(userTierWhenUnavailable, dfContent))
    );
  }
  addAvailableContent(dfContents: DfContent[]) {
    return this.addContentInfos(...dfContents.map((dfContent) => makeAvailableContentInfo(dfContent)));
  }
  public abstract addContentInfos(...contentInfos: DfContentInfo[]): Promise<void>;
  abstract getContentInfoList(contentNames: string[]): Promise<(DfContentInfo | undefined)[]>;
  abstract getContentInfoMap(contentNames: string[]): Promise<Map<string, DfContentInfo>>;
  abstract getAllContentInfos(): Promise<DfContentInfo[]>;
  abstract getContentInfo(contentName: string): Promise<DfContentInfo | undefined>;
  removeContentInfo(contentName: string): Promise<void> {
    return this.removeContentInfos([contentName]);
  }
  async getMostRecentContentInfo() {
    const allContentInfos = await this.getAllContentInfos();
    if (allContentInfos.length === 0) {
      return undefined;
    }
    return allContentInfos.sort((a, b) => {
      return b.meta.publishedDate.getTime() - a.meta.publishedDate.getTime();
    })[0];
  }
  async getAllTags() {
    const allContentInfos = await this.getAllContentInfos();
    const tagMap = new Map<string, number>();
    allContentInfos.forEach((contentInfo) => {
      contentInfo.meta.tags?.forEach((tag) => {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      });
    });
    return Array.from(tagMap, ([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }
  async query(params: Partial<DbQueryParams>) {
    params = Object.fromEntries(Object.entries(params).filter(([k, v]) => v));
    params = {
      ...defaultQueryParams,
      ...params,
    };
    let { page, limit, search, tags, status } = params as DbQueryParams;
    tags = tags?.map((tag) => tag.toLowerCase());
    search = search?.toLowerCase();
    const allContentInfos = await this.getAllContentInfos();
    const filtered =
      search || tags || status
        ? allContentInfos.filter((contentInfo) => {
            if (search) {
              if (!contentInfo.meta.title.toLowerCase().includes(search)) {
                return false;
              }
            }
            if (tags) {
              const lowerTags = contentInfo.meta.tags?.map((tag) => tag.toLowerCase());
              if (!lowerTags?.find((tag) => tags!.includes(tag))) {
                return false;
              }
            }
            if (status) {
              if (!status.includes(contentInfo.status)) {
                return false;
              }
            }
            return true;
          })
        : allContentInfos;
    const start = page === 0 && limit === Infinity ? 0 : page * limit;
    return {
      params,
      totalResults: filtered.length,
      totalDurationSeconds: DfContentInfo.getTotalDuration(filtered),
      queryResult: filtered.slice(start, start + limit),
    };
  }
  abstract removeContentInfos(contentNames: string[]): Promise<void>;
  abstract setUserInfo(user: UserInfo): Promise<void>;
  abstract getUserInfo(): Promise<UserInfo | undefined>;
  abstract setFirstRunComplete(): Promise<void>;
}
