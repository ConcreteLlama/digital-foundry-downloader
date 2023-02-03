import { Expose, Type } from "class-transformer";
import { config } from "./config/config.js";
import { LogLevel } from "./logger.js";
import { stringToDuration } from "./utils/time-utils.js";

export type MediaInfo = {
  duration?: string;
  size?: string;
  mediaType: string;
  videoEncoding?: string;
  audioEncoding?: string;
  videoId?: string;
  url: string;
};

export class DfContent {
  @Type(() => Date)
  @Expose()
  publishedDate: Date;
  @Expose()
  public name!: string;
  @Expose()
  public title!: string;
  @Expose()
  public description: string | undefined;
  @Expose()
  public mediaInfo!: MediaInfo[];
  @Expose()
  public dataPaywalled!: boolean;
  @Expose()
  public tags?: string[];

  constructor(
    name: string,
    title: string,
    description: string | undefined,
    mediaInfo: MediaInfo[],
    dataPaywalled: boolean,
    publishedDate?: Date,
    tags?: string[]
  ) {
    if (!name) {
      this.publishedDate = new Date();
      return;
    }
    this.name = name;
    this.title = title;
    this.description = description;
    this.mediaInfo = mediaInfo;
    this.dataPaywalled = dataPaywalled;
    this.tags = tags;
    if (publishedDate) {
      this.publishedDate = publishedDate;
    } else {
      this.publishedDate = DfContent.extractDateFromName(name);
    }
    if (isNaN(this.publishedDate.getTime())) {
      this.publishedDate = new Date();
    }
  }

  makeFileName(mediaInfo: MediaInfo) {
    const extension = mediaInfo.mediaType === "MP3" ? "mp3" : "mp4";
    return `${this.name}.${extension}`;
  }

  getDurationSeconds() {
    const errs: string[] = [];
    for (const mediaInfo of this.mediaInfo) {
      if (mediaInfo.duration) {
        try {
          const toReturn = stringToDuration(mediaInfo.duration);
          if (errs.length > 0) {
            config.logger.log(LogLevel.DEBUG, `${this.name} contains some media infos with invalid durations: ${errs}`);
          }
          return toReturn;
        } catch (e) {
          errs.push(mediaInfo.duration);
        }
      }
    }
    config.logger.log(
      LogLevel.DEBUG,
      `Unable to get duration from ${this.name} as no media info containing valid duration (full duration list: ${errs})`
    );
    return 0;
  }

  static getTotalDuration(dfContents: DfContent[]) {
    return dfContents.reduce((toReturn, dfContentInfo) => (toReturn += dfContentInfo.getDurationSeconds()), 0);
  }

  static extractDateFromName(name: string) {
    const dateStr = name.substring(0, "0000-00-00".length);
    return new Date(Date.parse(dateStr));
  }
}

export const ContentListFetchModes = ["RSS_FEED", "ARCHIVE"] as const;
export type ContentListFetchMode = typeof ContentListFetchModes[number];

export enum ContentInfoStatus {
  AVAILABLE = "AVAILABLE",
  CONTENT_PAYWALLED = "CONTENT_PAYWALLED",
  DOWNLOADED = "DOWNLOADED",
}

//TODO: Actually implement constructors for these and new them in the db; constructors can cause
//some weirdness with class-transformer so leaving it for now

export class DfContentInfo {
  @Expose()
  name!: string;
  @Expose()
  status!: ContentInfoStatus;
  @Type(() => DfContent)
  @Expose()
  meta!: DfContent;

  static getTotalDuration(dfContentInfos: DfContentInfo[]) {
    return dfContentInfos.reduce((toReturn, dfContentInfo) => (toReturn += dfContentInfo.meta.getDurationSeconds()), 0);
  }
}

export class DownloadedContentInfo extends DfContentInfo {
  @Expose()
  format!: string;
  @Type(() => Date)
  @Expose()
  downloadDate!: Date;
  @Expose()
  downloadLocation!: string;
  @Expose()
  size?: string;
}

export class PaywalledContentInfo extends DfContentInfo {
  @Expose()
  userTierWhenUnavailable!: string;
}

export type UserInfo = {
  username: string;
  tier: string;
};
