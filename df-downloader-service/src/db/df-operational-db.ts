import {
  DfContentEntry,
  DfContentEntryCreate,
  DfContentEntryUpdate,
  DfContentEntryUtils,
  DfContentInfo,
  DfContentInfoQueryParams,
  DfContentStatus,
  DfContentStatusInfo,
  DfTagInfo,
  DfUserInfo,
  logger,
  mapFilterEmpty,
} from "df-downloader-common";
import { DfContentDownloadInfo, DfContentSubtitleInfo } from "df-downloader-common/models/df-content-download-info.js";
import { pathIsEqual } from "../utils/file-utils.js";
import { ServiceContentUtils } from "../utils/service-content-utils.js";

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

export type DownloadInfoWithName = {
  name: string;
  downloadInfo: DfContentDownloadInfo;
};

export abstract class DfDownloaderOperationalDb {
  abstract init(): Promise<DbInitInfo>; //Returns true if this is first run
  async contentDownloaded(dfContentName: string, downloadInfo: DfContentDownloadInfo) {
    const existingContent = await this.getContentEntry(dfContentName);
    if (!existingContent) {
      throw new Error(`Content ${dfContentName} not found`);
    }
    const updated = ServiceContentUtils.addDownload(existingContent, downloadInfo);
    return this.addOrUpdateEntries(updated);
  }
  async subsGenerated(dfContentName: string, downloadLocation: string, subsInfo: DfContentSubtitleInfo) {
    const existingContent = await this.getContentEntry(dfContentName);
    if (!existingContent) {
      throw new Error(`Content ${dfContentName} not found`);
    }
    // Note: For now, we can only replace subs, not add them. So we use setSubs.
    const contentEntry = ServiceContentUtils.setSubs(existingContent, downloadLocation, [subsInfo]);
    return this.setContentEntries([contentEntry]);
  }
  async addDownloads(downloadInfos: DownloadInfoWithName[]) {
    const existingEntries = await this.getContentEntryList(downloadInfos.map((downloadInfo) => downloadInfo.name));
    const replacementEntries = mapFilterEmpty(existingEntries, (existingEntry, idx) => {
      const downloadInfo = downloadInfos[idx];
      if (!existingEntry) {
        logger.log("warn", `Content ${downloadInfo.name} not found, cannot add download info`);
        return;
      }
      return ServiceContentUtils.addDownload(existingEntry, downloadInfo.downloadInfo);
    });
    await this.setContentEntries(replacementEntries);
  }
  async removeDownload(dfContentName: string, downloadLocation: string) {
    const existingContent = await this.getContentEntry(dfContentName);
    if (!existingContent) {
      throw new Error(`Content ${dfContentName} not found`);
    }
    existingContent.downloads = existingContent.downloads.filter((d) => !pathIsEqual(d.downloadLocation, downloadLocation));
    return this.addOrUpdateEntries(existingContent);
  }
  async moveDownload(dfContentName: string, oldDownloadLocation: string, newDownloadLocation: string) {
    const existingContent = await this.getContentEntry(dfContentName);
    if (!existingContent) {
      throw new Error(`Content ${dfContentName} not found`);
    }
    const updated = ServiceContentUtils.moveDownload(existingContent, oldDownloadLocation, newDownloadLocation);
    return this.addOrUpdateEntries(updated);
  };
  async updateContentStatusInfo(dfContentName: string, statusInfo: Partial<DfContentStatusInfo>) {
    const existingContent = await this.getContentEntry(dfContentName);
    if (!existingContent) {
      throw new Error(`Content ${dfContentName} not found`);
    }
    const newStatusInfo = { ...existingContent.statusInfo, ...statusInfo };
    existingContent.statusInfo = newStatusInfo;
    return this.addOrUpdateEntries(existingContent);
  }
  async updateContentEntry(dfContentName: string, updates: DfContentEntryUpdate) {
    const existingContent = await this.getContentEntry(dfContentName);
    if (!existingContent) {
      throw new Error(`Content ${dfContentName} not found`);
    }
    const updated = DfContentEntryUtils.update(existingContent, updates);
    return (await this.addOrUpdateEntries(updated))[0];
  }
  async updateContentInfo(dfContentName: string, updates: DfContentInfo) {
    const existingContent = await this.getContentEntry(dfContentName);
    if (!existingContent) {
      throw new Error(`Content ${dfContentName} not found`);
    }
    const updated = DfContentEntryUtils.update(existingContent, {
      name: dfContentName,
      contentInfo: updates,
    });
    return (await this.addOrUpdateEntries(updated))[0];
  }
  addContents(userTier: string | undefined, dfContents: DfContentInfo[]) {
    return this.addOrUpdateEntries(
      ...dfContents.map((dfContent) =>
        dfContent.dataPaywalled
          ? DfContentEntryUtils.create(dfContent.name, dfContent, {
              status: DfContentStatus.PAYWALLED,
              userTierWhenUnavailable: userTier,
            })
          : DfContentEntryUtils.create(dfContent.name, dfContent, { status: DfContentStatus.AVAILABLE })
      )
    );
  }
  protected abstract setContentEntries(contentEntries: DfContentEntry[]): Promise<void>;
  public async addOrUpdateEntries(...contentInfos: DfContentEntryCreate[]): Promise<DfContentEntry[]> {
    const existingEntries = await this.getContentEntryList(contentInfos.map((contentInfo) => contentInfo.name));
    const replacementEntries = existingEntries.map((existingEntry, idx) => {
      const contentInfo = contentInfos[idx];
      if (!existingEntry) {
        return DfContentEntryUtils.create(contentInfo.name, contentInfo.contentInfo, contentInfo.statusInfo);
      }
      return DfContentEntryUtils.update(existingEntry, contentInfo);
    });
    await this.setContentEntries(replacementEntries);
    return replacementEntries;
  }
  public async updateEntries(...contentEntries: DfContentEntryUpdate[]): Promise<DfContentEntry[]> {
    const existingEntries = await this.getContentEntryList(contentEntries.map((contentInfo) => contentInfo.name));
    const { replacementEntries, missingEntries } = existingEntries.reduce(
      (acc, existingEntry, idx) => {
        const contentInfo = contentEntries[idx];
        if (existingEntry) {
          acc.replacementEntries.push(DfContentEntryUtils.update(existingEntry, contentInfo));
        } else {
          missingEntries.push(contentEntries[idx].name);
        }
        return acc;
      },
      { replacementEntries: [], missingEntries: [] } as {
        replacementEntries: DfContentEntry[];
        missingEntries: string[];
      }
    );
    await this.setContentEntries(replacementEntries);
    if (missingEntries.length > 0) {
      logger.log("warn", `Missing entries for update: ${missingEntries.join(", ")}`);
    }
    return replacementEntries;
  }
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
  abstract setDfUserInfo(user?: DfUserInfo): Promise<void>;
  abstract getDfUserInfo(): Promise<DfUserInfo | undefined>;
  abstract setFirstRunComplete(): Promise<void>;
}
