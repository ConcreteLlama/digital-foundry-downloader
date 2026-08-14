import { DfContentInfo, inferMediaInfo, logger, mapFilterEmpty, zodParse } from "df-downloader-common";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { ensureDirectory, moveFile } from "../../utils/file-utils.js";
import { DfContentInfoDbSchema, DfContentStatusDbSchema, DfContentStatusEntry, DfUserDbSchema } from "../df-db-model.js";
import { FileDb } from "../file-db.js";

const CURRENT_DB_VERSION = "2.6.0";
/** Must match DfContentAvailabilityDb's own CURRENT_DB_VERSION - see the 2.5.0->2.6.0 patch step below. */
const CONTENT_STATUS_DB_VERSION_AFTER_KEY_MIGRATION = "2.5.0";

export class DfContentInfoDb {
    private data: DfContentInfoDbSchema;
    static async create(dbDir: string) {
        const oldDbFilename = path.join(dbDir, "db.json");
        const contentInfoDbFilename = path.join(dbDir, "content-info-db.json");
        if (existsSync(oldDbFilename) && !existsSync(contentInfoDbFilename)) {
            logger.log("info", `Migrating DB from old location ${oldDbFilename} to new location ${contentInfoDbFilename}`);
            await moveFile(oldDbFilename, contentInfoDbFilename, {
                clobber: false,
            });
        }
        ensureDirectory(dbDir);
        const fileDb = await FileDb.create<DfContentInfoDbSchema>({
            schema: DfContentInfoDbSchema,
            filename: contentInfoDbFilename,
            initialData: {
                contentInfo: {},
                version: CURRENT_DB_VERSION,
                lastUpdated: new Date(),
            },
            backupDestination: async (data) => {
                const version = data?.version || "NO_VERSION";
                const backupDir = path.join(dbDir, "backups");
                const backupDbPath = path.join(backupDir, `content-info-db-${version}-${Date.now()}.json`);
                ensureDirectory(backupDir);
                return backupDbPath;
            },
            patchRoutine: async (data) => {
                const version = data.version;
                if (version === CURRENT_DB_VERSION) {
                    logger.log("info", `DB already at version ${CURRENT_DB_VERSION} - no patches to apply`);
                    data = zodParse(DfContentInfoDbSchema, data);
                    return {
                        data,
                        patched: false,
                    };
                }
                if (!version) {
                    logger.log("info", `Patching DB version to 1.0.0`);
                    data.version = "1.0.0";
                    data.firstRunComplete = true;
                    data.lastUpdated = new Date();
                    //TODO: Map
                    data.contentInfo = data.ignored
                        ? Object.values(data.ignored).map((contentInfo: any) => {
                            contentInfo.status = contentInfo.reason;
                            delete contentInfo.reason;
                            if (contentInfo.status === "MANUAL") {
                                contentInfo.status = "AVAILABLE";
                            }
                            return contentInfo;
                        })
                        : [];
                    delete data.ignored;
                }
                while (data.version !== CURRENT_DB_VERSION) {
                    if (data.version === "1.0.0") {
                        logger.log("info", `Patching DB version to 2.0.0`);
                        //this is pre-transform so don't need to worry about map
                        data.contentInfo = Object.entries(data.contentInfo).map(([key, value]: [string, any]) => {
                            const contentInfo = value.meta;
                            delete value.meta;
                            const name = value.name;
                            delete value.name;
                            if (!value || Object.keys(value).length === 0) {
                                value = {
                                    status: "AVAILABLE",
                                };
                            }
                            return {
                                name,
                                contentInfo,
                                statusInfo: value,
                                dataVersion: "1.0.0",
                            };
                        });
                        data.refetchRequired = true;
                        data.version = "2.0.0";
                    } else if (data.version === "2.0.0") {
                        logger.log("info", `Patching DB version to 2.0.1`);
                        for (const contentInfo of Object.values(data.contentInfo) as any[]) {
                            for (const mediaInfo of contentInfo.contentInfo.mediaInfo || []) {
                                delete mediaInfo.url;
                            }
                        }
                        data.version = "2.0.1";
                    } else if (data.version === "2.0.1") {
                        logger.log("info", `Patching DB version to 2.2.0`);
                        for (const contentInfo of Object.values(data.contentInfo) as any[]) {
                            const statusInfo = contentInfo.statusInfo;
                            if (statusInfo.status === "ATTEMPTING_DOWNLOAD" || statusInfo.status === "DOWNLOADED") {
                                statusInfo.status = "AVAILABLE";
                            } else if (statusInfo.status === "CONTENT_PAYWALLED") {
                                statusInfo.status = "PAYWALLED";
                            }
                            const { format, downloadDate, downloadLocation, size } = statusInfo;
                            contentInfo.statusInfo = {
                                status: statusInfo.status,
                                userTierWhenUnavailable: statusInfo.userTierWhenUnavailable,
                            };
                            if (format && downloadDate && downloadLocation) {
                                contentInfo.downloads = [
                                    {
                                        format,
                                        downloadDate,
                                        downloadLocation,
                                        size,
                                    },
                                ];
                            } else {
                                contentInfo.downloads = [];
                            }
                        }
                        data.version = "2.2.0";
                    } else if (data.version === "2.2.0") {
                        const userInfo = data.user;
                        const userTier = userInfo.tier || 'NONE';
                        const contentStatuses: DfContentStatusDbSchema = {
                            version: CURRENT_DB_VERSION,
                            lastUpdated: new Date(),
                            firstRunComplete: data.firstRunComplete,
                            // This ancient migration predates the new site entirely, so
                            // nothing has completed a new-site scan yet.
                            newSiteFirstScanComplete: false,
                            contentStatuses: Object.entries(data.contentInfo).reduce((acc: Record<string, DfContentStatusEntry>, [key, value]: [string, any]) => {
                                value.contentInfo.mediaInfo = (value.contentInfo.mediaInfo || []).map((mediaInfo: any) => {
                                    return inferMediaInfo({
                                        format: mediaInfo.mediaType,
                                        videoProperties: mediaInfo.videoEncoding,
                                        audioProperties: mediaInfo.audioEncoding,
                                        duration: mediaInfo.duration,
                                        size: mediaInfo.size,
                                        videoId: mediaInfo.videoId,
                                        mediaFilename: mediaInfo.mediaFilename,
                                    })
                                });
                                acc[value.name] = {
                                    availability: {
                                        availability: value.statusInfo.status,
                                        availabilityInTiers: {
                                            [userTier]: value.statusInfo.status,
                                        },
                                    },
                                    downloads: mapFilterEmpty(value.downloads, (download: any) => {
                                        const format = download.format;
                                        const mediaInfo = value.contentInfo.mediaInfo.find((media: any) => media.formatString === format);
                                        if (!mediaInfo) {
                                            return null;
                                        }
                                        return {
                                            downloadDate: download.downloadDate,
                                            downloadLocation: download.downloadLocation,
                                            size: download.size,
                                            mediaInfo,
                                        }
                                    })  
                                };
                                return acc;
                            }, {}),
                        }
                        logger.log("info", 'Writing content statuses to new DB');
                        const contentStatusDbFilename = path.join(dbDir, "content-status-db.json");
                        await fs.writeFile(contentStatusDbFilename, JSON.stringify(contentStatuses, null, 2));
                        const userDbInfo: DfUserDbSchema = {
                            version: CURRENT_DB_VERSION,
                            lastUpdated: new Date(),
                            dfUser: userInfo,
                        }
                        logger.log("info", 'Writing user info to new DB');
                        const userDbFilename = path.join(dbDir, "user-db.json");
                        await fs.writeFile(userDbFilename, JSON.stringify(userDbInfo, null, 2));
                        delete data.user;
                        delete data.firstRunComplete;
                        delete data.refetchRequired;
                        const contentInfoRecords = Object.values(data.contentInfo).reduce((acc: any, contentEntry: any) => {
                            const contentInfo = contentEntry.contentInfo;
                            delete contentInfo.dataPaywalled;
                            contentInfo.dataVersion = contentEntry.dataVersion;
                            acc[contentEntry.name] = contentInfo;
                            delete contentEntry.downloads;
                            delete contentEntry.statusInfo;
                            return acc;
                        }, {});
                        data.contentInfo = contentInfoRecords;
                        data.version = "2.3.0";
                    } else if (data.version === "2.3.0") {
                        logger.log("info", `Patching DB version to 2.5.0`);
                        // Add source field to all content info records
                        Object.values(data.contentInfo).forEach((contentInfo: any) => {
                            if (!contentInfo.source) {
                                contentInfo.source = "digitalfoundry";
                            }
                        });
                        data.version = "2.5.0";
                    } else if (data.version === "2.5.0") {
                        logger.log("info", `Patching DB version to 2.6.0`);
                        // The relaunched digitalfoundry.net has no per-video DF-hosted
                        // page anymore, so `name` (the old DF URL slug) can no longer
                        // double as both identity and filename basis - every entry now
                        // needs an explicit, namespaced `key` (see DfContentInfo.key in
                        // df-downloader-common). Prefer the youtubeVideoId already
                        // cached by the old scraper (most entries have one - it
                        // extracted embedded YouTube iframes); otherwise fall back to
                        // preserving the old slug as a "legacy-" key so nothing is
                        // silently discarded. `name` itself is left untouched here for
                        // filename backward-compatibility. See the "Backward
                        // compatibility" section of docs/DF_SITE_MIGRATION.md.
                        //
                        // dataVersion is deliberately NOT bumped by this step - these
                        // records' actual content (media formats, download URLs) is
                        // still whatever the old, now-decommissioned site last reported
                        // and is almost certainly stale/dead. Leaving dataVersion alone
                        // means the existing dataVersion-mismatch-triggers-refresh logic
                        // in DigitalFoundryContentManager.patchMetas() will pick these
                        // entries up for a real metadata refresh against the new site
                        // once that's wired back into the startup flow - no separate
                        // "backfill" step needed here, and no network calls belong in a
                        // DB patch routine.
                        const keyMap = new Map<string, string>();
                        const newContentInfo: Record<string, any> = {};
                        Object.entries(data.contentInfo).forEach(([oldKey, contentInfo]: [string, any]) => {
                            const youtubeVideoId = contentInfo.youtubeVideoId;
                            const legacyKey = `legacy-${oldKey}`;
                            const key = youtubeVideoId ? `yt-${youtubeVideoId}` : legacyKey;
                            contentInfo.key = key;
                            contentInfo.possibleAltKeys = youtubeVideoId ? [legacyKey] : [];
                            newContentInfo[key] = contentInfo;
                            keyMap.set(oldKey, key);
                        });
                        data.contentInfo = newContentInfo;

                        // Coordinated rekey of content-status-db.json, which is keyed
                        // by the exact same strings - same reasoning as the
                        // content-status/user DB split in the 2.2.0->2.3.0 step above:
                        // do it here, directly, rather than trying to pass state between
                        // independently-loaded DB classes (which wouldn't survive a
                        // crash between the two, leaving the files permanently out of
                        // sync with no way to recover the old->new mapping).
                        const contentStatusDbFilename = path.join(dbDir, "content-status-db.json");
                        if (existsSync(contentStatusDbFilename)) {
                            const contentStatusRaw = JSON.parse(await fs.readFile(contentStatusDbFilename, "utf-8"));
                            const newContentStatuses: Record<string, any> = {};
                            Object.entries(contentStatusRaw.contentStatuses || {}).forEach(([oldKey, status]) => {
                                const newKey = keyMap.get(oldKey) || oldKey;
                                newContentStatuses[newKey] = status;
                            });
                            contentStatusRaw.contentStatuses = newContentStatuses;
                            contentStatusRaw.version = CONTENT_STATUS_DB_VERSION_AFTER_KEY_MIGRATION;
                            // This rewrite jumps straight to content-status-db's target
                            // version, skipping its own patch chain - so newer fields that
                            // chain would otherwise backfill (added after this constant was
                            // last bumped) need to be stamped here too. False is correct:
                            // this is a migration of an existing (old-site) DB, so nothing
                            // has completed a new-site scan yet either way.
                            contentStatusRaw.newSiteFirstScanComplete = false;
                            contentStatusRaw.lastUpdated = new Date();
                            logger.log("info", `Rekeying content-status-db.json to match (${Object.keys(newContentStatuses).length} entries)`);
                            await fs.writeFile(contentStatusDbFilename, JSON.stringify(contentStatusRaw, null, 2));
                        }
                        data.version = "2.6.0";
                    } else {
                        throw new Error(`Unrecognized DB version ${data.version}`);
                    }
                }
                logger.log("info", `DB patched to version ${CURRENT_DB_VERSION}`);
                // Validate the final data structure
                data = zodParse(DfContentInfoDbSchema, data);
                return {
                    data,
                    patched: true,
                };
            },
        });
        return new DfContentInfoDb(fileDb, zodParse(DfContentInfoDbSchema, fileDb.getData()));
    }
    private constructor(private readonly fileDb: FileDb<DfContentInfoDbSchema>, data: DfContentInfoDbSchema) {
        this.data = data;
    }
    private updateDb() {
        this.data.lastUpdated = new Date();
        this.fileDb.scheduleUpdateDb(this.data);
    }
    getAllContentNames(): string[] {
        return Object.keys(this.data.contentInfo);
    }
    setContentInfos(contentInfos: DfContentInfo[]) {
        if (contentInfos.length === 0) {
            return;
        }
        contentInfos.forEach((contentInfo) => this.data.contentInfo[contentInfo.key] = contentInfo);
        this.updateDb();
    }
    getAllContentInfos(): DfContentInfo[] {
        return Object.values(this.data.contentInfo);
    }
    getContentInfoList(contentNames: string[]): (DfContentInfo | null)[] {
        return contentNames.map((contentName) => this.data.contentInfo[contentName] || null);
    }
    getContentInfoMap(contentNames: string[]): Map<string, DfContentInfo> {
        const toReturn = new Map<string, DfContentInfo>();
        contentNames.forEach((contentName) => {
            const toAdd = this.data.contentInfo[contentName];
            if (toAdd) {
                toReturn.set(contentName, toAdd);
            }
        });
        return toReturn;
    }
    removeContentInfos(contentNames: string[]) {
        for (const contentName of contentNames) {
            delete this.data.contentInfo[contentName];
        }
        this.updateDb();
    }
    getContentInfo(contentName: string) {
        return this.data.contentInfo[contentName];
    }
}
