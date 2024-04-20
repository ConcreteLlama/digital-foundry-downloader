import { DfContentInfo } from "df-downloader-common";

import { SubtitleInfo } from "./media-utils/subtitles/subtitles.js";
import { MediaMeta, injectMediaMetadata } from "./utils/media-metadata.js";

export const makeMediaMeta = (contentInfo?: DfContentInfo, subtitles?: SubtitleInfo): MediaMeta => ({
  title: contentInfo?.title,
  publishedDate: contentInfo?.publishedDate,
  description: contentInfo?.description,
  synopsis: contentInfo?.description,
  tags: contentInfo?.tags,
  subtitles,
});

type InjectDfMetaParams =
  | {
      contentInfo: DfContentInfo;
      subtitleInfo?: SubtitleInfo;
    }
  | {
      contentInfo?: DfContentInfo;
      subtitleInfo: SubtitleInfo;
    };

export const injectDfMeta = (mediaFilePath: string, { contentInfo, subtitleInfo }: InjectDfMetaParams) =>
  injectMediaMetadata(mediaFilePath, makeMediaMeta(contentInfo, subtitleInfo));
