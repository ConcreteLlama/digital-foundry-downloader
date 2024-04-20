import { JSONFile, Low } from "lowdb";
import { DfContentEntry, DfUserInfo, zodParse } from "df-downloader-common";
import { logger } from "df-downloader-common";
import { WorkerQueue } from "../utils/queue-utils.js";
import { DbInitInfo, DfDownloaderOperationalDb } from "./df-operational-db.js";
import { ensureEnvString } from "../utils/env-utils.js";
import { ensureDirectory } from "../utils/file-utils.js";
import path from "path";
import { DfDbFileSchema, DfDbRuntimeSchema } from "./df-db-model.js";
import { existsSync } from "fs";
import { copyFile } from "fs/promises";
import { CURRENT_VERSION } from "../version.js";

export class DfLowDb extends DfDownloaderOperationalDb {
  private data!: DfDbRuntimeSchema;
  private writeQueue: WorkerQueue;
  static async create() {
    const dbDir = ensureEnvString("DB_DIR", "db");
    await ensureDirectory(dbDir);
    const adapter = new JSONFile<any>(path.join(dbDir, "db.json"));
    const db = new Low<any>(adapter);
    return new DfLowDb(dbDir, db);
  }
  private constructor(readonly dbDir: string, private readonly db: Low<any>) {
    super();
    this.writeQueue = new WorkerQueue({
      concurrent: 1,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
  private async updateDb() {
    this.data.lastUpdated = new Date();
    this.db.data = zodParse(DfDbFileSchema, this.data);
    await this.writeQueue
      .addWork(async () => {
        logger.log("info", "Writing to DB");
        await this.db.write();
        logger.log("info", "Wrote to DB");
      })
      .catch((error) => {
        logger.log("error", error);
      });
  }
  async init(): Promise<DbInitInfo> {
    await this.db.read();
    if (this.db.data) {
      await this.applyPatches();
    } else {
      this.data = {
        contentInfo: new Map<string, DfContentEntry>(),
        firstRunComplete: false,
        version: CURRENT_VERSION,
        lastUpdated: new Date(),
      };
      await this.updateDb();
    }
    this.data = zodParse(DfDbRuntimeSchema, this.db.data!);
    await this.updateDb();
    return {
      firstRun: this.data.firstRunComplete === true ? false : true,
    };
  }

  async backup(): Promise<void> {
    const curDbPath = path.join(this.dbDir, "db.json");
    if (!existsSync(curDbPath)) {
      return;
    }
    const version = this.db.data?.version || "NO_VERSION";
    const backupDir = path.join(this.dbDir, "backups");
    const backupDbPath = path.join(backupDir, `db-${version}-${Date.now()}.json`);
    await ensureDirectory(backupDir);
    await copyFile(curDbPath, backupDbPath);
  }

  async applyPatches() {
    const data = this.db.data!;
    const version = data.version;
    if (version === CURRENT_VERSION) {
      logger.log("info", `DB already at version ${CURRENT_VERSION} - no patches to apply`);
      this.data = zodParse(DfDbRuntimeSchema, data);
      return false;
    }
    logger.log("info", `DB version is ${version}, backing up before patching`);
    await this.backup();
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
      } else {
        throw new Error(`Unrecognized DB version ${data.version}`);
      }
    }
    this.data = zodParse(DfDbRuntimeSchema, data);
    await this.updateDb();
  }
  protected async setContentEntries(contentEntries: DfContentEntry[]): Promise<void> {
    if (contentEntries.length === 0) {
      return;
    }
    contentEntries.forEach((contentEntry) => this.data.contentInfo.set(contentEntry.name, contentEntry));
    await this.updateDb();
  }
  async getAllContentEntries(): Promise<DfContentEntry[]> {
    return Array.from(this.data.contentInfo.values());
  }
  async getContentEntryList(contentNames: string[]): Promise<(DfContentEntry | undefined)[]> {
    return contentNames.map((contentName) => this.data.contentInfo.get(contentName));
  }
  async getContentInfoMap(contentNames: string[]): Promise<Map<string, DfContentEntry>> {
    const toReturn = new Map<string, DfContentEntry>();
    contentNames.forEach((contentName) => {
      const toAdd = this.data.contentInfo.get(contentName);
      if (toAdd) {
        toReturn.set(contentName, toAdd);
      }
    });
    return toReturn;
  }
  async removeContentInfos(contentNames: string[]): Promise<void> {
    for (const contentName of contentNames) {
      this.data.contentInfo.delete(contentName);
    }
    await this.updateDb();
  }
  async setDfUserInfo(user: DfUserInfo): Promise<void> {
    this.data.user = user;
    await this.updateDb();
  }
  async getDfUserInfo(): Promise<DfUserInfo | undefined> {
    return this.data.user;
  }
  async setFirstRunComplete(): Promise<void> {
    this.data.firstRunComplete = true;
    await this.updateDb();
  }
  async getContentEntry(contentName: string) {
    return this.data.contentInfo.get(contentName);
  }
}
