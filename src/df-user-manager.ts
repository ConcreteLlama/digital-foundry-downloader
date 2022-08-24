import { DfDownloaderOperationalDb, UserInfo } from "./db/df-operational-db.js";
import { getUserInfo } from "./df-fetcher.js";
import _ from "lodash";

export type UserTierChangeListener = (newTier: string) => void | Promise<void>;

export class DfUserManager {
  currentUserInfo?: UserInfo;
  userTierChangeListeners: UserTierChangeListener[] = [];
  constructor(readonly db: DfDownloaderOperationalDb) {}

  addUserTierChangeListener(userTierChangeListener: UserTierChangeListener) {
    this.userTierChangeListeners.push(userTierChangeListener);
  }

  async checkUserInfo() {
    const userInfo = (await getUserInfo()) || { username: "unknown", tier: "unknown" };
    if (!_.isEqual(this.currentUserInfo, userInfo)) {
      this.currentUserInfo = userInfo;
      if (userInfo) {
        this.userTierChangeListeners.forEach((listener) => listener(userInfo.tier));
        this.db.setUserInfo(userInfo);
      }
    }
    return userInfo;
  }
  async start() {
    this.currentUserInfo = await this.db.getUserInfo();
    await this.checkUserInfo();
    setInterval(() => this.checkUserInfo(), 10000);
  }

  getCurrentTier() {
    return this.currentUserInfo ? this.currentUserInfo.tier : "unknown";
  }
  isUserSignedIn() {
    return this.getCurrentTier() !== "unknown";
  }
}
