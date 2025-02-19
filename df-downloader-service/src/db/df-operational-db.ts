import {
  DfContentAvailability,
  DfContentAvailabilityInfo,
  DfContentEntry,
  DfContentInfo,
  DfContentInfoQueryParams,
  DfTagInfo,
  DfUserInfo
} from "df-downloader-common";
import { DfContentDownloadInfo, DfContentSubtitleInfo } from "df-downloader-common/models/df-content-download-info.js";

export const defaultQueryParams: DfContentInfoQueryParams = {
  limit: Infinity,
  page: 1,
  tagMode: "or",
  sortBy: "date",
  sortDirection: "desc",
};

export type ContentInfoWithAvailability = {
  contentInfo: DfContentInfo;
  availability: DfContentAvailability;
}

export type ContentAvailabilityParams = {
  contentName: string;
  availability: DfContentAvailability;
}

export type DownloadInfoWithName = {
  name: string;
  downloadInfo: DfContentDownloadInfo;
};
export type RemoveDownloadOpts = {
  contentName: string;
  downloadLocation: string;
};
export type MoveDownloadOpts = {
  contentName: string;
  oldLocation: string;
  newLocation: string;
};
export type AddContentEntryOpts = {
  contentInfo: DfContentInfo;
  statusInfo: DfContentAvailabilityInfo;
}
export type DfDbQueryResult = {
  params: DfContentInfoQueryParams;
  totalResults: number;
  totalDurationSeconds: number;
  queryResult: DfContentEntry[];
}

export abstract class DfDownloaderOperationalDb {
  abstract init(): Promise<void>; //Returns true if this is first run

  abstract getAllContentNames(): Promise<string[]>;
  abstract getContentEntryList(contentNames: string[]): Promise<(DfContentEntry | undefined)[]>;
  abstract getContentEntryMap(contentNames: string[]): Promise<Map<string, DfContentEntry>>;
  abstract getAllContentEntries(): Promise<DfContentEntry[]>;

  abstract getContentStatusInfos(contentNames: string[]): Promise<Record<string, DfContentAvailabilityInfo>>;
  abstract getContentDownloadInfos(contentNames: string[]): Promise<Record<string, DfContentDownloadInfo[]>>;
  
  abstract getAllContentStatusInfos(): Promise<Record<string, DfContentAvailabilityInfo>>;
  abstract getAllContentDownloadInfos(): Promise<Record<string, DfContentDownloadInfo[]>>;

  abstract isFirstRunComplete(): Promise<boolean>;
  abstract setFirstRunComplete(isComplete: boolean): Promise<void>;

  abstract getAllTags(): Promise<DfTagInfo[]>;

  abstract getContentEntry(contentName: string): Promise<DfContentEntry | undefined>;
  abstract setContentInfos(contentInfos: DfContentInfo[]): Promise<void>;
  abstract setContentStatuses(contentStatuses: Record<string, DfContentAvailabilityInfo>): Promise<void>;
  abstract setContentAvailailabilities(contentAvailabilities: ContentAvailabilityParams[], userTier: string): Promise<void>;
  abstract removeContentInfos(contentNames: string[]): Promise<void>;
  abstract setDfUserInfo(user?: DfUserInfo): Promise<void>;
  abstract getDfUserInfo(): Promise<DfUserInfo | undefined>;
  abstract addDownloads(downloadInfos: DownloadInfoWithName[]): Promise<void>;
  abstract removeDownloads(downloads: RemoveDownloadOpts[]): Promise<void>;
  abstract moveDownloads(moves: MoveDownloadOpts[]): Promise<{
    missingFiles: MoveDownloadOpts[];
  }>;
  abstract subsGenerated(dfContentName: string, downloadLocation: string, subsInfo: DfContentSubtitleInfo): Promise<void>;
  protected abstract doQuery(params: DfContentInfoQueryParams): Promise<DfDbQueryResult>;

  async setContentInfosWithAvailability(contentInfosWithStatuses: ContentInfoWithAvailability[], userTier: string) {
    const [ contentInfos, availabilityParams ] = contentInfosWithStatuses.reduce(
      (acc, entry) => {
        acc[0].push(entry.contentInfo);
        acc[1].push({ contentName: entry.contentInfo.name, availability: entry.availability });
        return acc;
      },
      [[], []] as [DfContentInfo[], ContentAvailabilityParams[]]
    );
    await this.setContentInfos(contentInfos);
    await this.setContentAvailailabilities(availabilityParams, userTier)
  }

  contentDownloaded(dfContentName: string, downloadInfo: DfContentDownloadInfo) {
    return this.addDownloads([{ name: dfContentName, downloadInfo }]);
  }
  async removeDownload(dfContentName: string, downloadLocation: string) {
    return this.removeDownloads([{ contentName: dfContentName, downloadLocation }]);
  }
  async moveDownload(dfContentName: string, oldDownloadLocation: string, newDownloadLocation: string) {
    return this.moveDownloads([{ contentName: dfContentName, oldLocation: oldDownloadLocation, newLocation: newDownloadLocation }]);
  };
  async setContentInfo(contentInfo: DfContentInfo) {
    return this.setContentInfos([contentInfo]);
  }
  async setContentStatus(contentName: string, contentStatus: DfContentAvailabilityInfo) {
    return this.setContentStatuses({ [contentName]: contentStatus });
  }
  removeContentInfo(contentName: string) {
    return this.removeContentInfos([contentName]);
  }
  async addContentEntries(entries: AddContentEntryOpts[]) {
    const { contentInfos, statusInfos } = entries.reduce(
      (acc, entry) => {
        acc.contentInfos.push(entry.contentInfo);
        acc.statusInfos[entry.contentInfo.name] = entry.statusInfo;
        return acc;
      },
      { contentInfos: [] as DfContentInfo[], statusInfos: {} as Record<string, DfContentAvailabilityInfo> }
    );
    await this.setContentInfos(contentInfos);
    await this.setContentStatuses(statusInfos);
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

  query(queryParams: Partial<DfContentInfoQueryParams>) {
    queryParams = Object.fromEntries(Object.entries(queryParams).filter(([k, v]) => v));
    const params = {
      ...defaultQueryParams,
      ...queryParams,
    };
    return this.doQuery(params);
  }
  
}
