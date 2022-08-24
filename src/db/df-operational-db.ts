export interface IgnoredContentInfo {
  name: string;
  reason: IgnoredContentReason;
}

export interface DownloadeContentInfo extends IgnoredContentInfo {
  format: string;
  downloadDate: string;
  downloadLocation: string;
  size?: string;
}

export interface PaywalledContentInfo extends IgnoredContentInfo {
  userTierWhenUnavailable: string;
}

export enum IgnoredContentReason {
  MANUAL = "MANUAL",
  CONTENT_PAYWALLED = "CONTENT_PAYWALLED",
  DOWNLOADED = "DOWNLOADED",
}

export type UserInfo = {
  username: string;
  tier: string;
};

export abstract class DfDownloaderOperationalDb {
  abstract init(): Promise<boolean>; //Returns true if this is first run
  async contentDownloaded(
    name: string,
    format: string,
    downloadLocation: string,
    size: string | undefined,
    downloadDate: string
  ) {
    this.addContentToIgnoreList([
      {
        name,
        reason: IgnoredContentReason.DOWNLOADED,
        format,
        downloadLocation,
        downloadDate,
        size,
      } as DownloadeContentInfo,
    ]);
  }
  async ignorePaywalledContent(name: string, userTierWhenUnavailable: string) {
    this.addContentToIgnoreList([
      {
        name,
        userTierWhenUnavailable,
        reason: IgnoredContentReason.CONTENT_PAYWALLED,
      } as PaywalledContentInfo,
    ]);
  }
  async ignoreContents(names: string[]) {
    this.addContentToIgnoreList(
      names.map((name) => ({
        name,
        reason: IgnoredContentReason.MANUAL,
      }))
    );
  }
  protected abstract addContentToIgnoreList(ignoreContentInfos: IgnoredContentInfo[]): Promise<void>;
  abstract getIgnoredInfos(contentNames: string[]): Promise<IgnoredContentInfo[]>;
  abstract getAllIgnoredInfos(): Promise<IgnoredContentInfo[]>;
  async getIgnoredInfo(contentName: string): Promise<IgnoredContentInfo | undefined> {
    return (await this.getIgnoredInfos([contentName]))[0];
  }
  removeIgnoredContentInfo(contentName: string): Promise<void> {
    return this.removeIgnoredContentInfos([contentName]);
  }
  abstract removeIgnoredContentInfos(contentNames: string[]): Promise<void>;
  abstract setUserInfo(user: UserInfo): Promise<void>;
  abstract getUserInfo(): Promise<UserInfo | undefined>;
}
