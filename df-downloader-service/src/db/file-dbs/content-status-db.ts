import { DfContentAvailability, DfContentAvailabilityInfo, DfContentDownloadInfo, DfContentSubtitleInfo, logger, zodParse } from "df-downloader-common";
import path from "path";
import { ensureDirectory, pathIsEqual } from "../../utils/file-utils.js";
import { DfContentStatusDbSchema, DfContentStatusEntry } from "../df-db-model.js";
import { ContentAvailabilityParams, DownloadInfoWithName, MoveDownloadOpts, RemoveDownloadOpts } from "../df-operational-db.js";
import { FileDb } from "../file-db.js";

const CURRENT_DB_VERSION = "2.3.0";

const defaultContentStatus: DfContentAvailabilityInfo = {
    availability: DfContentAvailability.UNKNOWN,
    availabilityInTiers: {} as Record<string, DfContentAvailability>,
}

export class DfContentAvailabilityDb {
    private data: DfContentStatusDbSchema;
    static async create(dbDir: string) {
        const contentInfoDbFilename = path.join(dbDir, "content-status-db.json");
        ensureDirectory(dbDir);
        const fileDb = await FileDb.create<DfContentStatusDbSchema>({
            schema: DfContentStatusDbSchema,
            filename: contentInfoDbFilename,
            initialData: {
                version: CURRENT_DB_VERSION,
                firstRunComplete: false,
                lastUpdated: new Date(),
                contentStatuses: {}
            },
            backupDestination: async (data) => {
                const version = data?.version || "NO_VERSION";
                const backupDir = path.join(dbDir, "backups");
                const backupDbPath = path.join(backupDir, `content-status-db-${version}-${Date.now()}.json`);
                ensureDirectory(backupDir);
                return backupDbPath;
            },
            patchRoutine: async (data) => {
                const version = data.version;
                if (version === CURRENT_DB_VERSION) {
                    logger.log("info", `DB already at version ${CURRENT_DB_VERSION} - no patches to apply`);
                    data = zodParse(DfContentStatusDbSchema, data);
                    return {
                        data,
                        patched: false,
                    };
                }
                while (data.version !== CURRENT_DB_VERSION) {
                    data.version = "2.3.0";
                }
                logger.log("info", `DB patched to version ${CURRENT_DB_VERSION}`);
                return {
                    data,
                    patched: true,
                };
            },
        });
        return new DfContentAvailabilityDb(fileDb, zodParse(DfContentStatusDbSchema, fileDb.getData()));
    }
    private constructor(private readonly fileDb: FileDb<DfContentStatusDbSchema>, data: DfContentStatusDbSchema) {
        this.data = data;
    }
    private updateDb() {
        this.data.lastUpdated = new Date();
        this.fileDb.scheduleUpdateDb(this.data);
    }
    private forceGetContentStatus (contentName: string) {
        let currentContentStatus = this.data.contentStatuses[contentName];
        let isNew = false;
        if (!currentContentStatus) {
            currentContentStatus = {
                availability: defaultContentStatus,
                downloads: [],
            };
            this.data.contentStatuses[contentName] = currentContentStatus;
            isNew = true;
        }
        return {
            contentStatus: currentContentStatus!,
            isNew,
        };
    }
    private getTransformContentStatusEntries<T>(contentNames: string[], createIfNotExists: boolean, transformer: (contentStatus: DfContentStatusEntry) => T) {
        let added = false;
        if (!createIfNotExists) {
            return contentNames.reduce((acc: Record<string, T>, contentName) => {
                acc[contentName] = transformer(this.data.contentStatuses[contentName]);
                return acc;
            }, {});
        }
        const toReturn = contentNames.reduce((acc: Record<string, T>, contentName) => {
            const { contentStatus, isNew } = this.forceGetContentStatus(contentName);
            if (isNew) {
                added = true;
            }
            acc[contentName] = transformer(contentStatus);
            return acc;
        }, {});
        if (added) {
            this.updateDb();
        }
        return toReturn;
    }
    getContentStatusEntries(contentNames: string[], createIfNotExists = false) {
        return this.getTransformContentStatusEntries(contentNames, createIfNotExists, (contentStatus) => contentStatus);
    }
    getContentStatus(contentName: string, createIfNotExists = false) {
        if (!createIfNotExists) {
            return this.data.contentStatuses[contentName];
        }
        const { contentStatus, isNew } = this.forceGetContentStatus(contentName);
        if (isNew) {
            this.updateDb();
        }
        return contentStatus;
    }
    addDownloads(downloads: DownloadInfoWithName[]) {
        const contentStatuses = this.getContentStatusEntries(downloads.map((d) => d.name), true);
        downloads.forEach((download) => {
            const curStatus = contentStatuses[download.name];
            const downloadIndex = curStatus.downloads.findIndex((d) => pathIsEqual(d.downloadLocation, download.downloadInfo.downloadLocation));
            if (downloadIndex === -1) {
                curStatus.downloads.push(download.downloadInfo);
            } else {
                curStatus.downloads[downloadIndex] = download.downloadInfo;
            }
        });
        this.updateDb();
    }
    removeDownloads(downloads: RemoveDownloadOpts[]) {
        const contentStatuses = this.getContentStatusEntries(downloads.map((d) => d.contentName), true);
        downloads.forEach((download) => {
            const curStatus = contentStatuses[download.contentName];
            curStatus.downloads = curStatus.downloads.filter((d) => !pathIsEqual(d.downloadLocation, download.downloadLocation));
        });
        this.updateDb();
    }
    moveDownloads(moves: MoveDownloadOpts[]) {
        const contentStatuses = this.getContentStatusEntries(moves.map((m) => m.contentName), true);
        const missingFiles: MoveDownloadOpts[] = [];
        moves.forEach((move) => {
            const curStatus = contentStatuses[move.contentName];
            const download = curStatus.downloads.find((d) => pathIsEqual(d.downloadLocation, move.oldLocation));
            if (!download) {
                missingFiles.push(move);
                return;
            }
            download.downloadLocation = move.newLocation;
        });
        if (missingFiles.length) {
            logger.log("warn", "Missing files in moveDownloads", missingFiles);
        }
        this.updateDb();
        return {
            missingFiles
        }
    }
    subsGenerated(contentName: string, downloadLocation: string, subsInfo: DfContentSubtitleInfo) {
        const curStatus = this.getContentStatus(contentName, true);
        const download = curStatus.downloads.find((d) => d.downloadLocation === downloadLocation);
        if (!download) {
            throw new Error(`Download ${downloadLocation} not found for content ${contentName}`);
        }
        download.subtitles = download.subtitles || [];
        download.subtitles.push(subsInfo);
        this.updateDb();
        return this.data.contentStatuses[contentName];
    }
    findDownloadByLocation(downloadLocation: string) {
        const contentStatuses = this.data.contentStatuses;
        for (const contentName in contentStatuses) {
            const contentStatus = contentStatuses[contentName];
            const download = contentStatus.downloads.find((d) => d.downloadLocation === downloadLocation);
            if (download) {
                return {
                    contentName,
                    download,
                };
            }
        }
        return undefined;
    }
    setStatuses(contentStatuses: Record<string, DfContentAvailabilityInfo>) {
        for (const [ contentName, status ] of Object.entries(contentStatuses)) {
            this.data.contentStatuses[contentName] = {
                availability: status,
                downloads: this.data.contentStatuses[contentName]?.downloads || [],
            };
        }
        this.updateDb();
        return this.data.contentStatuses;
    }
    setStatus(contentName: string, status: DfContentAvailabilityInfo) {
        return this.setStatuses({ [contentName]: status })[0];
    }
    removeContentStatuses(contentNames: string[]) {
        for (const contentName of contentNames) {
            delete this.data.contentStatuses[contentName];
        }
        this.updateDb();
        return this.data.contentStatuses;
    }
    async getContentDownloadInfos(contentNames: string[]): Promise<Record<string, DfContentDownloadInfo[]>> {
        return this.getTransformContentStatusEntries(contentNames, false, (contentStatus) => contentStatus.downloads);
    }
    async getContentAvailabilityInfos(contentNames: string[]): Promise<Record<string, DfContentAvailabilityInfo>> {
        return this.getTransformContentStatusEntries(contentNames, false, (contentStatus) => contentStatus.availability);
    }
    setContentAvailabilities(records: ContentAvailabilityParams[], userTier: string) {
        for (const { contentName, availability } of records) {
            const currentStatus = this.data.contentStatuses[contentName]?.availability || defaultContentStatus;
            currentStatus.availability = availability;
            if (availability !== DfContentAvailability.UNKNOWN) {
                currentStatus.availabilityInTiers[userTier] = availability;
            }
        }
        this.updateDb();
    }
    setFirstRunComplete(isComplete: boolean) {
        this.data.firstRunComplete = isComplete;
        this.updateDb();
    }
    isFirstRunComplete() {
        return this.data.firstRunComplete;
    }
}
