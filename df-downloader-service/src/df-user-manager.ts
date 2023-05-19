import _ from "lodash";
import { DfDownloaderOperationalDb } from "./db/df-operational-db.js";
import { getDfUserInfo } from "./df-fetcher.js";
import { DfUserInfo } from "df-downloader-common";

export type UserTierChangeListener = (newTier?: string) => void | Promise<void>;

export class DfUserManager {
  currentDfUserInfo?: DfUserInfo;
  userTierChangeListeners: UserTierChangeListener[] = [];
  constructor(readonly db: DfDownloaderOperationalDb) {}

  addUserTierChangeListener(userTierChangeListener: UserTierChangeListener) {
    this.userTierChangeListeners.push(userTierChangeListener);
  }

  async checkDfUserInfo() {
    const userInfo = await getDfUserInfo();
    if (!_.isEqual(this.currentDfUserInfo, userInfo)) {
      this.currentDfUserInfo = userInfo;
      this.userTierChangeListeners.forEach((listener) => listener(userInfo?.tier));
      this.db.setDfUserInfo(userInfo);
    }
    return userInfo;
  }
  async start() {
    this.currentDfUserInfo = await this.db.getDfUserInfo();
    await this.checkDfUserInfo();
    setInterval(() => this.checkDfUserInfo(), 10000);
  }

  getCurrentTier() {
    return this.currentDfUserInfo?.tier;
  }
  isUserSignedIn() {
    return Boolean(this.getCurrentTier());
  }
}
