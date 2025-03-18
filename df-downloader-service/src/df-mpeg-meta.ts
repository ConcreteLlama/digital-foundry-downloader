import { DfContentInfo, MediaFileMeta } from "df-downloader-common";

import { GeneratedSubtitleInfo } from "./media-utils/subtitles/subtitles.js";
import { injectMediaMetadata } from "./utils/media-metadata.js";
import { Chapter } from "./utils/chatpers.js";

export const makeMediaFileMeta = (contentInfo?: DfContentInfo | null, subtitles?: GeneratedSubtitleInfo | null, chapters?: Chapter[] | null): MediaFileMeta => ({
  title: contentInfo?.title,
  publishedDate: contentInfo?.publishedDate,
  description: contentInfo?.description,
  tags: contentInfo?.tags,
  subtitles,
  chapters,
});

type InjectDfMetaParams = {
      contentInfo?: DfContentInfo;
      subtitleInfo?: GeneratedSubtitleInfo;
      chapters?: Chapter[];
}
      
export const injectDfMeta = (mediaFilePath: string, { contentInfo, subtitleInfo, chapters }: InjectDfMetaParams) =>
  injectMediaMetadata(mediaFilePath, makeMediaFileMeta(contentInfo, subtitleInfo, chapters));
