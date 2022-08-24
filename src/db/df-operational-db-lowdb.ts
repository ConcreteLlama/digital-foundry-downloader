import { JSONFile, Low } from "lowdb";
import { DfDownloaderOperationalDb, IgnoredContentInfo, UserInfo } from "./df-operational-db.js";
import { config } from "../config/config.js";

type DfRuntimeInfo = {
  ignored: { [key: string]: IgnoredContentInfo };
  user?: UserInfo;
};

export class DfLowDb extends DfDownloaderOperationalDb {
  static async create() {
    const adapter = new JSONFile<DfRuntimeInfo>(`${config.configDir}/db.json`);
    const db = new Low<DfRuntimeInfo>(adapter);
    return new DfLowDb(db);
  }
  private constructor(private readonly db: Low<DfRuntimeInfo>) {
    super();
  }
  async init() {
    await this.db.read();
    if (!this.db.data) {
      this.db.data = {
        ignored: {},
      };
      await this.db.write();
      return true;
    }
    return false;
  }

  async addContentToIgnoreList(ignoredContentInfos: IgnoredContentInfo[]): Promise<void> {
    ignoredContentInfos.forEach(
      (ignoredContentInfo) => (this.db.data!.ignored[ignoredContentInfo.name] = ignoredContentInfo)
    );
    await this.db.write();
  }
  async getAllIgnoredInfos(): Promise<IgnoredContentInfo[]> {
    return Object.values(this.db.data!.ignored);
  }
  async getIgnoredInfos(contentNames: string[]): Promise<IgnoredContentInfo[]> {
    return contentNames.map((contentName) => this.db.data!.ignored[contentName]);
  }
  async removeIgnoredContentInfos(contentNames: string[]): Promise<void> {
    for (const contentName of contentNames) {
      delete this.db.data!.ignored[contentName];
    }
    await this.db.write();
  }
  async setUserInfo(user: UserInfo): Promise<void> {
    this.db.data!.user = user;
    this.db.write();
  }
  async getUserInfo(): Promise<UserInfo | undefined> {
    return this.db.data!.user;
  }
}
