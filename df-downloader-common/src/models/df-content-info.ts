import { z } from "zod";
import { MediaInfo, MediaInfoUtils } from "./media-info.js";

export const DfContentInfo = z
  .object({
    publishedDate: z.coerce.date(),
    name: z.string(),
    title: z.string(),
    description: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    youtubeVideoId: z.string().optional(),
    mediaInfo: z.array(MediaInfo),
    dataPaywalled: z.boolean(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

export type DfContentInfo = z.infer<typeof DfContentInfo>;

export const DfContentInfoUtils = {
  create: (
    name: string,
    title: string,
    description: string | undefined,
    mediaInfo: MediaInfo[],
    thumbnailUrl: string,
    youtubeVideoId: string | undefined,
    dataPaywalled: boolean,
    publishedDate?: Date,
    tags?: string[]
  ): DfContentInfo => ({
    name,
    title,
    description,
    mediaInfo,
    thumbnailUrl,
    youtubeVideoId,
    dataPaywalled,
    tags: tags || [],
    publishedDate: publishedDate || DfContentInfoUtils.extractDateFromName(name) || new Date(),
  }),
  extractDateFromName(name: string) {
    const dateStr = name.substring(0, "0000-00-00".length);
    return new Date(Date.parse(dateStr));
  },
  getTotalDuration(dfContents: DfContentInfo[]) {
    return dfContents.reduce(
      (toReturn, dfContentInfo) => (toReturn += MediaInfoUtils.getDurationSeconds(dfContentInfo.mediaInfo)),
      0
    );
  },
  getThumbnailUrl(dfContentInfo: DfContentInfo, width: number, height?: number) {
    return this.thumbnailUrlToSize(dfContentInfo.thumbnailUrl || "", width, height);
  },
  thumbnailUrlToSize(thumbnailUrl: string, width: number, height?: number) {
    height = height ? height : Math.floor((width * 9) / 16);
    return (thumbnailUrl || "").replace(/\/thumbnail\/.*\//, `/thumbnail/${width}x${height}/`);
  },
  getDurationSeconds(dfContentInfo: DfContentInfo) {
    return MediaInfoUtils.getDurationSeconds(dfContentInfo.mediaInfo);
  },
  getMediaInfo(dfContentInfo: DfContentInfo, mediaType: string) {
    return dfContentInfo.mediaInfo.find((mediaInfo) => mediaInfo.mediaType === mediaType);
  },
};

export const DummyContentInfos: DfContentInfo[] = [{
  name: "johns-japanese-crt-adventure",
  title: "John's Japanese CRT Adventure",
  description: "John does some retro stuff in Japan while lugging around a CRT",
  mediaInfo: [
    {
      mediaType: "h264",
      mediaFilename: "Johns Japanese CRT Adventure.mp4",
    },
    {
      mediaType: "HEVC",
      mediaFilename: "Johns Japanese CRT Adventure HEVC.mp4",
    }
  ],
  thumbnailUrl: "",
  youtubeVideoId: "",
  dataPaywalled: false,
  publishedDate: new Date("2021-01-01T00:14:00Z"),
  tags: [
    "retro",
    "japan",
    "crt",
    "john"
  ],
}, {
  name: "df-direct-weekly-599",
  title: "DF Direct Weekly 599",
  description: "Digital Foundry Direct Weekly 599 - that's right, the 599th DF Direct Weekly! Not sure this will go down as well as the 299th",
  mediaInfo: [
    {
      mediaType: "h264",
      mediaFilename: "DF Direct Weekly 599.mp4",
    },
    {
      mediaType: "HEVC",
      mediaFilename: "DF Direct Weekly 599 HEVC.mp4",
    }
  ],
  thumbnailUrl: "",
  youtubeVideoId: "",
  tags: [
    "DF Direct",
  ],
  dataPaywalled: false,
  publishedDate: new Date("2032-10-09T17:12:01Z"),
}, {
  name: "alexs-favorite-stutters-of-2025-year-in-review",
  title: "Alex's Favorite Stutters of 2025 - Year in Review",
  description: "Alex goes through his favorite stutters of 2025 - with one stutter so long he managed to make a cup of tea!",
  mediaInfo: [
    {
      mediaType: "h264",
      mediaFilename: "Alexs Favorite Stutters of 2025.mp4",
    },
    {
      mediaType: "HEVC",
      mediaFilename: "Alexs Favorite Stutters of 2025 HEVC.mp4",
    },
    {
      mediaType: "MP3",
      mediaFilename: "Alexs Favorite Stutters of 2025 audio.mp3",
    }
  ],
  thumbnailUrl: "",
  youtubeVideoId: "",
  dataPaywalled: true,
  publishedDate: new Date("2025-12-31T23:59:59Z"),
}];

export const randomDummyContentInfo = (not?: string) => {
  const pool = not ? DummyContentInfos.filter((info) => info.name !== not) : DummyContentInfos;
  return pool[Math.floor(Math.random() * pool.length)];
};