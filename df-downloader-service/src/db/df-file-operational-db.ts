import { DfContentDownloadInfo, DfContentEntry, DfContentEntryUtils, DfContentInfo, DfContentInfoQueryParams, DfContentAvailabilityInfo, DfContentSubtitleInfo, DfTagInfo, DfUserInfo, DfContentAvailability } from "df-downloader-common";
import { ensureEnvString } from "../utils/env-utils.js";
import { ContentAvailabilityParams, DfDbQueryResult, DfDownloaderOperationalDb, DownloadInfoWithName, MoveDownloadOpts, RemoveDownloadOpts } from "./df-operational-db.js";
import { DfContentInfoDb } from "./file-dbs/content-info-db.js";
import { DfContentAvailabilityDb } from "./file-dbs/content-status-db.js";
import { DfUserDb } from "./file-dbs/user-db.js";
import { DfContentStatusEntry } from "./df-db-model.js";

export class DfFileOperationalDb extends DfDownloaderOperationalDb {
    async getAllContentNames(): Promise<string[]> {
        return this.contentInfoDb.getAllContentNames();
    }
    async getContentStatusInfos(contentNames: string[]): Promise<Record<string, DfContentAvailabilityInfo>> {
        return this.contentStatusDb.getContentAvailabilityInfos(contentNames);
    }
    async getContentDownloadInfos(contentNames: string[]): Promise<Record<string, DfContentDownloadInfo[]>> {
        return this.contentStatusDb.getContentDownloadInfos(contentNames);
    }
    async getAllContentStatusInfos(): Promise<Record<string, DfContentAvailabilityInfo>> {
        return this.contentStatusDb.getContentAvailabilityInfos(this.contentInfoDb.getAllContentNames());
    }
    async getAllContentDownloadInfos(): Promise<Record<string, DfContentDownloadInfo[]>> {
        return this.contentStatusDb.getContentDownloadInfos(this.contentInfoDb.getAllContentNames());
    }
    async setContentAvailailabilities(contentAvailabilities: ContentAvailabilityParams[], userTier: string): Promise<void> {
        return this.contentStatusDb.setContentAvailabilities(contentAvailabilities, userTier);
    }
    async getAllTags(): Promise<DfTagInfo[]> {
        const allContentInfos = this.contentInfoDb.getAllContentInfos();
        const tagMap = new Map<string, number>();
        allContentInfos.forEach((contentInfo) => {
            contentInfo.tags?.forEach((tag) => {
                tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
            });
        });
        return Array.from(tagMap, ([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
    }
    static async create() {
        const dbDir = ensureEnvString("DB_DIR", "db");
        const contentInfoDb = await DfContentInfoDb.create(dbDir);
        const userDb = await DfUserDb.create(dbDir);
        const contentStatusDb = await DfContentAvailabilityDb.create(dbDir);
        return new DfFileOperationalDb(contentInfoDb, userDb, contentStatusDb);
    }
    private constructor(private readonly contentInfoDb: DfContentInfoDb, private readonly userDb: DfUserDb, private readonly contentStatusDb: DfContentAvailabilityDb) {
        super();
    }
    async init() {

    }
    private makeContentEntry(contentInfo: DfContentInfo, contentStatusEntry: DfContentStatusEntry): DfContentEntry {
        return {
            name: contentInfo.name,
            contentInfo: contentInfo,
            statusInfo: contentStatusEntry.availability,
            downloads: contentStatusEntry.downloads,
        }
    }
    public async setContentInfos(contentInfos: DfContentInfo[]) {
        return this.contentInfoDb.setContentInfos(contentInfos);
    }
    public async setContentStatuses(contentStatuses: Record<string, DfContentAvailabilityInfo>) {
        this.contentStatusDb.setStatuses(contentStatuses);
    }
    private getContentInfosAndStatuses(contentNames: string[]): { contentInfos: (DfContentInfo | null)[], contentStatuses: Record<string, DfContentStatusEntry> } {
        const contentInfos = this.contentInfoDb.getContentInfoList(contentNames);
        const foundContentNames = contentInfos.reduce((acc: string[], contentInfo) => {
            contentInfo?.name && acc.push(contentInfo.name);
            return acc;
        }, []);
        const contentStatuses = this.contentStatusDb.getContentStatusEntries(foundContentNames, true);
        return {
            contentInfos,
            contentStatuses,
        }
    }
    async getContentEntryList(contentNames: string[]) {
        const { contentInfos, contentStatuses } = this.getContentInfosAndStatuses(contentNames);
        return contentInfos.map((contentInfo) => {
            const contentStatusEntry = contentStatuses[contentInfo?.name || ""];
            return contentInfo ? this.makeContentEntry(contentInfo, contentStatusEntry) : undefined;
        });
    }
    async getContentEntryMap(contentNames: string[]) {
        const { contentInfos, contentStatuses } = this.getContentInfosAndStatuses(contentNames);
        return contentInfos.reduce((acc, contentInfo) => {
            if (!contentInfo) {
                return acc;
            }
            const contentStatusEntry = contentStatuses[contentInfo.name];
            acc.set(contentInfo.name, this.makeContentEntry(contentInfo, contentStatusEntry));
            return acc;
        }, new Map<string, DfContentEntry>());
    }
    async getAllContentEntries() {
        const allContentInfos = this.contentInfoDb.getAllContentInfos();
        const allContentStatuses = this.contentStatusDb.getContentStatusEntries(allContentInfos.map((c) => c.name), true);
        return allContentInfos.map((contentInfo) => {
            const contentStatusEntry = allContentStatuses[contentInfo.name];
            return this.makeContentEntry(contentInfo, contentStatusEntry);
        });
    }
    async getContentEntry(contentName: string) {
        const contentInfo = this.contentInfoDb.getContentInfo(contentName);
        if (!contentInfo) {
            return undefined;
        }
        const contentStatusEntry = this.contentStatusDb.getContentStatus(contentName, true);
        return this.makeContentEntry(contentInfo, contentStatusEntry);
    }
    async removeContentInfos(contentNames: string[], includeStatuses: boolean = false) {
        this.contentInfoDb.removeContentInfos(contentNames);
        if (includeStatuses) {
            this.contentStatusDb.removeContentStatuses(contentNames);
        }
    }
    async setDfUserInfo(user: DfUserInfo) {
        this.userDb.setDfUserInfo(user);
    }
    getDfUserInfo() {
        return this.userDb.getDfUserInfo();
    }

    async addDownloads(downloadInfos: DownloadInfoWithName[]) {
        return this.contentStatusDb.addDownloads(downloadInfos);
    }
    async removeDownloads(downloads: RemoveDownloadOpts[]): Promise<void> {
        return this.contentStatusDb.removeDownloads(downloads);
    }
    async moveDownloads(moves: MoveDownloadOpts[]): Promise<{ missingFiles: MoveDownloadOpts[]; }> {
        return this.contentStatusDb.moveDownloads(moves);
    }
    async subsGenerated(dfContentName: string, downloadLocation: string, subsInfo: DfContentSubtitleInfo) {
        this.contentStatusDb.subsGenerated(dfContentName, downloadLocation, subsInfo);
    }

    async isFirstRunComplete() {
        return this.contentStatusDb.isFirstRunComplete();
    }
    async setFirstRunComplete(isComplete: boolean) {
        return this.contentStatusDb.setFirstRunComplete(isComplete);
    }

    async doQuery(params: DfContentInfoQueryParams) {
        let { page, limit, search, tags, tagMode, availability, sortBy, sortDirection } = params;
        tags = tags?.map((tag) => tag.toLowerCase());
        search = search?.toLowerCase();
        const allContentEntries = await this.getAllContentEntries();
        const filtered =
            search || tags || availability
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
                        if (!status.includes(contentEntry.statusInfo.availability)) {
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
        const toReturn: DfDbQueryResult = {
            params,
            totalResults: sorted.length,
            totalDurationSeconds: DfContentEntryUtils.getTotalDuration(filtered),
            queryResult: sorted.slice(start, start + limit),
        };
        return toReturn;
    }
}