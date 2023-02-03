import { Expose, instanceToPlain, plainToInstance, Transform, Type } from "class-transformer";
import { JSONFile, Low } from "lowdb";
import { config } from "../config/config.js";
import {
  ContentInfoStatus,
  DfContentInfo,
  DownloadedContentInfo,
  PaywalledContentInfo,
  UserInfo,
} from "../df-types.js";
import { LogLevel } from "../logger.js";
import { WorkerQueue } from "../utils/queue-utils.js";
import { DfDownloaderOperationalDb } from "./df-operational-db.js";

export class DfRuntimeInfo {
  @Expose()
  version!: string;
  @Type(() => Date)
  @Expose()
  lastUpdated!: Date;
  @Expose()
  firstRunComplete!: boolean;
  @Expose()
  user?: UserInfo;
  @Expose()
  @Transform(
    ({ value }) => {
      const toReturn = new Map<string, DfContentInfo>();
      (value as any[]).forEach((val) => {
        const statusVal = (val as any).status as ContentInfoStatus;
        let type = DfContentInfo;
        if (statusVal === "AVAILABLE") {
          type = DfContentInfo;
        } else if (statusVal === "CONTENT_PAYWALLED") {
          type = PaywalledContentInfo;
        } else if (statusVal === "DOWNLOADED") {
          type = DownloadedContentInfo;
        }
        const dfContentInfo = plainToInstance(type, val);
        toReturn.set(dfContentInfo.name, dfContentInfo);
      });
      return toReturn;
    },
    { toClassOnly: true }
  )
  @Transform(
    ({ value }) => {
      return ([...value.values()] as DfContentInfo[]).sort((a, b) => {
        const aTime = a.meta?.publishedDate?.getTime() || 0;
        const bTime = b.meta?.publishedDate?.getTime() || 0;
        return aTime - bTime;
      });
    },
    { toPlainOnly: true }
  )
  contentInfo!: Map<string, DfContentInfo>;
}

const CURRENT_VERSION = "1.0.0";
const logger = config.logger;

export class DfLowDb extends DfDownloaderOperationalDb {
  private data!: DfRuntimeInfo;
  private writeQueue: WorkerQueue;
  static async create() {
    const adapter = new JSONFile<any>(`${config.configDir}/db.json`);
    const db = new Low<any>(adapter);
    return new DfLowDb(db);
  }
  private constructor(private readonly db: Low<any>) {
    super();
    this.writeQueue = new WorkerQueue({
      concurrent: 1,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
  private async updateDb() {
    this.data.lastUpdated = new Date();
    this.db.data = instanceToPlain(this.data, {
      excludeExtraneousValues: true,
    });
    await this.writeQueue
      .addWork(async () => {
        logger.log(LogLevel.INFO, "Writing to DB");
        await this.db.write();
        logger.log(LogLevel.INFO, "Wrote to DB");
      })
      .catch((error) => {
        logger.log(LogLevel.ERROR, error);
      });
  }
  async init() {
    await this.db.read();
    if (this.db.data) {
      await this.applyPatches();
    } else {
      this.data = await plainToInstance(DfRuntimeInfo, {
        contentInfo: new Map<string, DfContentInfo>(),
        firstRunComplete: false,
        version: CURRENT_VERSION,
        lastUpdated: new Date(),
      });
      await this.updateDb();
    }
    this.data = await plainToInstance(DfRuntimeInfo, this.db.data!);
    await this.updateDb();
    return this.data.firstRunComplete === true ? false : true;
  }

  async applyPatches() {
    const data = this.db.data!;
    const version = data.version;
    if (version === CURRENT_VERSION) {
      logger.log(LogLevel.INFO, `DB already at version ${CURRENT_VERSION} - no patches to apply`);
      this.data = await plainToInstance(DfRuntimeInfo, data);
      return;
    }
    if (!version) {
      logger.log(LogLevel.INFO, `Patching DB version to 1.0.0`);
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
    this.data = await plainToInstance(DfRuntimeInfo, data);
    await this.updateDb();
  }

  async addContentInfos(...contentInfos: DfContentInfo[]): Promise<void> {
    if (contentInfos.length === 0) {
      return;
    }
    contentInfos.forEach((contentInfo) => this.data.contentInfo.set(contentInfo.name, contentInfo));
    await this.updateDb();
  }
  async getAllContentInfos(): Promise<DfContentInfo[]> {
    return Array.from(this.data.contentInfo.values());
  }
  async getContentInfoList(contentNames: string[]): Promise<(DfContentInfo | undefined)[]> {
    return contentNames.map((contentName) => this.data.contentInfo.get(contentName));
  }
  async getContentInfoMap(contentNames: string[]): Promise<Map<string, DfContentInfo>> {
    const toReturn = new Map<string, DfContentInfo>();
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
  async setUserInfo(user: UserInfo): Promise<void> {
    this.data.user = user;
    await this.updateDb();
  }
  async getUserInfo(): Promise<UserInfo | undefined> {
    return this.data.user;
  }
  async setFirstRunComplete(): Promise<void> {
    this.data.firstRunComplete = true;
    await this.updateDb();
  }
  async getContentInfo(contentName: string) {
    return this.data.contentInfo.get(contentName);
  }
}
