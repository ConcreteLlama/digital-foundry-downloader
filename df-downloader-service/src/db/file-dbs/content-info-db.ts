import { DfContentInfo, logger, zodParse } from "df-downloader-common";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { ensureEnvString } from "../../utils/env-utils.js";
import { ensureDirectory, moveFile } from "../../utils/file-utils.js";
import { CURRENT_VERSION } from "../../version.js";
import { DfContentStatusDbSchema, DfContentStatusEntry, DfContentInfoDbSchema, DfUserDbSchema } from "../df-db-model.js";
import { FileDb } from "../file-db.js";

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
                version: CURRENT_VERSION,
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
                if (version === CURRENT_VERSION) {
                    logger.log("info", `DB already at version ${CURRENT_VERSION} - no patches to apply`);
                    data = zodParse(DfContentInfoDbSchema, data);
                    return data;
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
                while (data.version !== CURRENT_VERSION) {
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
                            version: CURRENT_VERSION,
                            lastUpdated: new Date(),
                            firstRunComplete: data.firstRunComplete,
                            contentStatuses: Object.entries(data.contentInfo).reduce((acc: Record<string, DfContentStatusEntry>, [key, value]: [string, any]) => {
                                acc[value.name] = {
                                    availability: {
                                        availability: value.statusInfo.status,
                                        availabilityInTiers: {
                                            [userTier]: value.statusInfo.status,
                                        },
                                    },
                                    downloads: value.downloads,
                                };
                                return acc;
                            }, {}),
                        }
                        logger.log("info", 'Writing content statuses to new DB');
                        const contentStatusDbFilename = path.join(dbDir, "content-status-db.json");
                        await fs.writeFile(contentStatusDbFilename, JSON.stringify(contentStatuses, null, 2));
                        const userDbInfo: DfUserDbSchema = {
                            version: CURRENT_VERSION,
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
                    } else {
                        throw new Error(`Unrecognized DB version ${data.version}`);
                    }
                }
                logger.log("info", `DB patched to version ${CURRENT_VERSION}`);
                return zodParse(DfContentInfoDbSchema, data);
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
        contentInfos.forEach((contentInfo) => this.data.contentInfo[contentInfo.name] = contentInfo);
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
