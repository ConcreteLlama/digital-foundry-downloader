import { DfContentInfo } from "df-downloader-common";

import { SubtitleInfo } from "./media-utils/subtitles/subtitles.js";
import { MediaMeta, injectMediaMetadata } from "./utils/media-metadata.js";
import { Chapter } from "./utils/chatpers.js";

export const makeMediaMeta = (contentInfo?: DfContentInfo, subtitles?: SubtitleInfo | null, chapters?: Chapter[] | null): MediaMeta => ({
  title: contentInfo?.title,
  publishedDate: contentInfo?.publishedDate,
  description: contentInfo?.description,
  synopsis: contentInfo?.description,
  tags: contentInfo?.tags,
  subtitles,
  chapters,
});

type InjectDfMetaParams = {
      contentInfo?: DfContentInfo;
      subtitleInfo?: SubtitleInfo;
      chapters?: Chapter[];
}
      
export const injectDfMeta = (mediaFilePath: string, { contentInfo, subtitleInfo, chapters }: InjectDfMetaParams) =>
  injectMediaMetadata(mediaFilePath, makeMediaMeta(contentInfo, subtitleInfo, chapters));
