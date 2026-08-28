import { DfContentAvailability, DfContentAvailabilityInfo, DfContentDownloadInfo, DfContentSubtitleInfo, logger, zodParse } from "df-downloader-common";
import path from "path";
import { ensureDirectory, pathIsEqual } from "../../utils/file-utils.js";
import { DfContentStatusDbSchema, DfContentStatusEntry } from "../df-db-model.js";
import { ContentAvailabilityParams, DownloadInfoWithName, MoveDownloadOpts, RemoveDownloadOpts } from "../df-operational-db.js";
import { FileDb } from "../file-db.js";

const CURRENT_DB_VERSION = "2.5.0";

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
                newSiteFirstScanComplete: false,
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
                    if (!data.version) {
                        data.version = "2.3.0";
                    } else if (data.version === "2.3.0") {
                        // Normally this file is rekeyed and bumped to 2.4.0 directly by
                        // DfContentInfoDb's 2.5.0->2.6.0 patch step (it needs the
                        // old->new key mapping, which only exists there). Reaching this
                        // branch means that coordinated rewrite didn't happen - e.g. a
                        // crash between the two DBs migrating - so entries here may
                        // still be under old-style keys. Bump the version so the app can
                        // start rather than getting stuck, but flag it loudly since
                        // affected entries won't line up with content-info-db.json until
                        // manually reconciled.
                        logger.log(
                            "warn",
                            "content-status-db.json reached version 2.3.0 without being rekeyed alongside content-info-db.json - some entries may be orphaned under old-style keys. See docs/DF_SITE_MIGRATION.md."
                        );
                        data.version = "2.4.0";
                    } else if (data.version === "2.4.0") {
                        logger.log("info", `Patching DB version to 2.5.0`);
                        // Existing DBs reaching this point predate the new site entirely
                        // (or were rekeyed by content-info-db.ts's coordinated rewrite,
                        // which already stamps this field - see below) - false is correct
                        // either way, since nothing has completed a new-site scan yet.
                        data.newSiteFirstScanComplete = false;
                        data.version = "2.5.0";
                    } else {
                        throw new Error(`Unrecognized DB version ${data.version}`);
                    }
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
            // A fresh copy, not a reference to the shared defaultContentStatus
            // constant - handing out the same object to multiple entries
            // meant mutating one entry's availability could silently mutate
            // every other entry still sharing that reference (confirmed as a
            // real, if not yet visibly damaging, bug 2026-08-15).
            currentContentStatus = {
                availability: { availability: defaultContentStatus.availability, availabilityInTiers: {} },
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
            // A content-info entry with no matching status entry is a real,
            // if unusual, state (confirmed against real historical data,
            // 2026-08-15: a 2655-entry content-info-db paired with a
            // 2580-entry content-status-db) - default rather than crash,
            // without persisting the default back to disk (that's what
            // createIfNotExists=true is for).
            return contentNames.reduce((acc: Record<string, T>, contentName) => {
                const contentStatus = this.data.contentStatuses[contentName] || {
                    availability: { availability: defaultContentStatus.availability, availabilityInTiers: {} },
                    downloads: [],
                };
                acc[contentName] = transformer(contentStatus);
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
        // createIfNotExists=false: removing/moving a download for a content name
        // that has no status entry has nothing to do, and creating an empty one
        // just persists junk keyed by a name that will never be looked up again
        // (which is exactly what the name-vs-key move bug used to do).
        const contentStatuses = this.getContentStatusEntries(downloads.map((d) => d.contentName), false);
        downloads.forEach((download) => {
            // Undefined now that entries are not created on demand - a name with
            // no status entry simply has nothing to remove.
            const curStatus = contentStatuses[download.contentName];
            if (!curStatus) {
                return;
            }
            curStatus.downloads = curStatus.downloads.filter((d) => !pathIsEqual(d.downloadLocation, download.downloadLocation));
        });
        this.updateDb();
    }
    moveDownloads(moves: MoveDownloadOpts[]) {
        const contentStatuses = this.getContentStatusEntries(moves.map((m) => m.contentName), false);
        const missingFiles: MoveDownloadOpts[] = [];
        moves.forEach((move) => {
            const curStatus = contentStatuses[move.contentName];
            // No status entry at all is the same failure as no matching download
            // within one - the file has moved and nothing recorded it - so it is
            // reported rather than skipped silently. Without this guard the
            // dereference below throws part-way through a batch.
            const download = curStatus?.downloads.find((d) => pathIsEqual(d.downloadLocation, move.oldLocation));
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
        // Update this if I ever add option to add more subs
        download.subtitles = [subsInfo];
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
            // forceGetContentStatus (not a manual fallback to the shared
            // defaultContentStatus constant) so a brand-new entry actually
            // gets created and persisted here, rather than silently mutating
            // a throwaway/shared object and discarding the result.
            const { contentStatus } = this.forceGetContentStatus(contentName);
            contentStatus.availability.availability = availability;
            if (availability !== DfContentAvailability.UNKNOWN) {
                contentStatus.availability.availabilityInTiers[userTier] = availability;
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
    setNewSiteFirstScanComplete(isComplete: boolean) {
        this.data.newSiteFirstScanComplete = isComplete;
        this.updateDb();
    }
    isNewSiteFirstScanComplete() {
        return this.data.newSiteFirstScanComplete;
    }
}
