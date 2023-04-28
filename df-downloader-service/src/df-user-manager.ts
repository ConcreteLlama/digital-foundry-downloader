import _ from "lodash";
import { DfDownloaderOperationalDb } from "./db/df-operational-db.js";
import { getUserInfo } from "./df-fetcher.js";
import { UserInfo } from "df-downloader-common";

export type UserTierChangeListener = (newTier?: string) => void | Promise<void>;

export class DfUserManager {
  currentUserInfo?: UserInfo;
  userTierChangeListeners: UserTierChangeListener[] = [];
  constructor(readonly db: DfDownloaderOperationalDb) {}

  addUserTierChangeListener(userTierChangeListener: UserTierChangeListener) {
    this.userTierChangeListeners.push(userTierChangeListener);
  }

  async checkUserInfo() {
    const userInfo = await getUserInfo();
    if (!_.isEqual(this.currentUserInfo, userInfo)) {
      this.currentUserInfo = userInfo;
      this.userTierChangeListeners.forEach((listener) => listener(userInfo?.tier));
      this.db.setUserInfo(userInfo);
    }
    return userInfo;
  }
  async start() {
    this.currentUserInfo = await this.db.getUserInfo();
    await this.checkUserInfo();
    setInterval(() => this.checkUserInfo(), 10000);
  }

  getCurrentTier() {
    return this.currentUserInfo?.tier;
  }
  isUserSignedIn() {
    return Boolean(this.getCurrentTier());
  }
}
