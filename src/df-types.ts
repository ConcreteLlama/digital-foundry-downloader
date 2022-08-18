import { DownloadProgressReport } from "./downloader";

export type MediaInfo = {
  duration?: string;
  size?: string;
  mediaType: string;
  videoEncoding?: string;
  audioEncoding?: string;
  videoId?: string;
  url?: string;
};

export class DfContent {
  publishedDate: Date;
  progress?: DownloadProgressReport;

  constructor(
    public name: string,
    public title: string,
    public description: string | undefined,
    public mediaInfo: MediaInfo[],
    publishedDate?: Date,
    public tags?: string[]
  ) {
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

  static extractDateFromName(name: string) {
    const dateStr = name.substring(0, "0000-00-00".length);
    return new Date(Date.parse(dateStr));
  }
}
