import _ from "lodash";
import { DfDownloaderOperationalDb } from "./db/df-operational-db.js";
import { getDfUserInfo } from "./df-fetcher.js";
import { DfUserInfo, logger } from "df-downloader-common";

export type UserTierChangeListener = (newTier?: string) => void | Promise<void>;

// How often to re-check auth status while ALREADY signed in, to catch an
// organic session expiry/revocation. Deliberately conservative - DF sessions
// are long-lived (the old sessionid cookie reportedly persisted indefinitely;
// autologin is confirmed non-rotating too), so there's no need to check often.
const SIGNED_IN_RECHECK_INTERVAL_MS = 30 * 60 * 1000;

export class DfUserManager {
  currentDfUserInfo?: DfUserInfo;
  userTierChangeListeners: UserTierChangeListener[] = [];
  constructor(readonly db: DfDownloaderOperationalDb) {}

  addUserTierChangeListener(userTierChangeListener: UserTierChangeListener) {
    this.userTierChangeListeners.push(userTierChangeListener);
  }

  async checkDfUserInfo(priority?: number) {
    const userInfo = await getDfUserInfo(undefined, priority);
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
    this.schedulePeriodicRecheck();
  }

  /**
   * Only re-checks on a timer while currently believed signed in - if we're
   * not, the cookie won't spontaneously start working on its own, the only
   * thing that changes that is the user reconfiguring it, which already
   * triggers an immediate recheck via DigitalFoundryContentManager's
   * configUpdated:digitalFoundry listener. Repeatedly polling with a cookie
   * already known not to work is exactly what got a real IP banned by
   * Digital Foundry's Cloudflare protection during testing (the previous
   * version of this method rechecked unconditionally every 10 seconds,
   * forever - see docs/DF_SITE_MIGRATION.md). Not signed in = stop and wait
   * to be told to try again, not keep hammering the site.
   */
  private schedulePeriodicRecheck() {
    if (!this.isUserSignedIn()) {
      return;
    }
    setTimeout(async () => {
      await this.checkDfUserInfo().catch((e) => {
        logger.log("error", "Unexpected error while re-checking Digital Foundry auth status", e);
      });
      this.schedulePeriodicRecheck();
    }, SIGNED_IN_RECHECK_INTERVAL_MS);
  }

  getCurrentTier() {
    return this.currentDfUserInfo?.tier;
  }
  isUserSignedIn() {
    return Boolean(this.getCurrentTier());
  }
}
