import { z } from "zod";
import { MediaInfo, MediaInfoUtils } from "./media-info/media-info.js";
import { makeVideoProps } from "./media-info/video-properties.js";

export const CURRENT_DATA_VERSION = "2.2.0";

export const DfContentSource = z.enum(["digitalfoundry", "manual", "patreon"]);
export type DfContentSource = z.infer<typeof DfContentSource>;

export const DfContentInfo = z
  .object({
    dataVersion: z.string(),
    publishedDate: z.coerce.date(),
    /**
     * Stable, internal identifier - the actual DB/dedup identity. Never shown
     * to the user, never used to build filenames. Namespaced by scheme so the
     * source is unambiguous at a glance: "yt-<youtube-video-id>" (preferred,
     * when the content links to a YouTube video), "dl-<download-id>"
     * (fallback, derived from the lowest of the content's own
     * videos/download/<id> links when there's no YouTube link), or a
     * preserved pre-relaunch DF slug for entries migrated from the old site.
     * See docs/DF_SITE_MIGRATION.md.
     */
    key: z.string(),
    /**
     * Other candidate identifiers spotted while parsing this entry, besides
     * whichever one became `key` - e.g. "mediaId-<id>" from a thumbnail URL,
     * or "dl-<id>" entries not chosen as the primary key. Collected
     * opportunistically as cheap insurance against the site's schema
     * changing (e.g. dropping YouTube links) - intentionally NOT used for
     * lookups/dedup anywhere today.
     */
    possibleAltKeys: z.array(z.string()).optional(),
    /** Lowercase, hyphenated, filename-safe slug derived from `title` (see slugifyTitle) - cosmetic only, not an identifier. */
    name: z.string(),
    title: z.string(),
    description: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    youtubeVideoId: z.string().optional(),
    mediaInfo: z.array(MediaInfo),
    tags: z.array(z.string()).optional(),
    source: DfContentSource,
    /**
     * True if this entry's data hasn't been confirmed against the live
     * post-relaunch site yet - set on entries carried over from the
     * pre-relaunch DB migration (their data, e.g. download URLs, may be
     * stale/dead), cleared the moment a live fetch (a scan match or a
     * refreshMeta) actually confirms fresh data for it. Distinct from
     * `dataVersion`, which is purely a schema-shape marker - don't conflate
     * "does this record match the current DfContentInfo shape" with
     * "has this record's data been verified" (see docs/DF_SITE_MIGRATION.md,
     * "Resuming after upgrading to this version"-adjacent notes).
     */
    legacy: z.boolean().default(false),
    /**
     * True if an automatic attempt to confirm this entry's data against the
     * live site (see `legacy`) definitively failed to relocate it there
     * (the best-effort title-search-then-page-scan has real limits for
     * older/very specific content). Stops `patchMetas()` from re-attempting
     * it on every future restart - `legacy` stays true (we still don't have
     * confirmed-fresh data), this just means "stop asking automatically".
     * A manual "refresh metadata" retry is unaffected by this flag.
     */
    unpatchable: z.boolean().default(false),
  })
  .strict();

export type DfContentInfo = z.infer<typeof DfContentInfo>;

export const DfContentInfoUtils = {
  create: (
    key: string,
    name: string,
    title: string,
    description: string | undefined,
    mediaInfo: MediaInfo[],
    thumbnailUrl: string,
    youtubeVideoId: string | undefined,
    publishedDate?: Date,
    tags?: string[],
    source?: DfContentSource,
    possibleAltKeys?: string[],
    legacy?: boolean,
    unpatchable?: boolean
  ): DfContentInfo => ({
    key,
    name,
    dataVersion: CURRENT_DATA_VERSION,
    title,
    description,
    mediaInfo,
    thumbnailUrl,
    youtubeVideoId,
    tags: tags || [],
    publishedDate: publishedDate || DfContentInfoUtils.extractDateFromName(name) || new Date(),
    source: source || "digitalfoundry",
    possibleAltKeys: possibleAltKeys || [],
    legacy: legacy || false,
    unpatchable: unpatchable || false,
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
  /**
   * Some new-site listing items are missing `.image img` in the source HTML,
   * so `thumbnailUrl` comes back empty (see df-fetcher.ts's parseListingItem) -
   * falls back to YouTube's own thumbnail when we at least have a video ID,
   * rather than rendering a broken image. This is pure URL construction, not
   * a network fetch - YouTube's per-video thumbnail paths are predictable
   * from the video ID alone, unlike description/duration/chapters which
   * need an actual page fetch (see sync-yt-video-meta.ts) - so no rate
   * limiting or lazy-loading is needed here, it's cheap enough to compute on
   * every render.
   */
  getThumbnailUrl(dfContentInfo: DfContentInfo, width: number, height?: number) {
    if (dfContentInfo.thumbnailUrl) {
      return this.thumbnailUrlToSize(dfContentInfo.thumbnailUrl, width, height);
    }
    if (dfContentInfo.youtubeVideoId) {
      // maxresdefault is the best-quality option but 404s for older/lower-res
      // uploads - callers rendering this in an <img> should pass an onError
      // handler that retries with getYoutubeThumbnailUrl(id, "hqdefault"),
      // which reliably exists for virtually every video (see
      // DfThumbnailImage in df-downloader-ui).
      return this.getYoutubeThumbnailUrl(dfContentInfo.youtubeVideoId, "maxresdefault");
    }
    return "";
  },
  thumbnailUrlToSize(thumbnailUrl: string, width: number, height?: number) {
    height = height ? height : Math.floor((width * 9) / 16);
    return (thumbnailUrl || "").replace(/\/thumbnail\/.*\//, `/thumbnail/${width}x${height}/`);
  },
  getYoutubeThumbnailUrl(
    youtubeVideoId: string,
    quality: "maxresdefault" | "sddefault" | "hqdefault" | "mqdefault" | "default" = "hqdefault"
  ) {
    return `https://i.ytimg.com/vi/${youtubeVideoId}/${quality}.jpg`;
  },
  getDurationSeconds(dfContentInfo: DfContentInfo) {
    return MediaInfoUtils.getDurationSeconds(dfContentInfo.mediaInfo);
  },
  getMediaInfo(dfContentInfo: DfContentInfo, mediaType: string) {
    return dfContentInfo.mediaInfo.find((mediaInfo) => mediaInfo.formatString === mediaType);
  },
};

export const DummyContentInfos: DfContentInfo[] = [{
  key: "dummy-johns-japanese-crt-adventure",
  name: "johns-japanese-crt-adventure",
  dataVersion: CURRENT_DATA_VERSION,
  title: "John's Japanese CRT Adventure",
  description: "John does some retro stuff in Japan while lugging around a CRT",
  mediaInfo: [
    {
      type: "VIDEO",
      formatString: "h264",
      mediaFilename: "Johns Japanese CRT Adventure.mp4",
      encoding: "h264",
      videoProperties: makeVideoProps("1080p", "60fps"),
      audioProperties: {
        encoding: "AAC",
        channels: "2.0",
        bitrate: 320000,
        sampleRate: 48000
      },
    },
    {
      type: "VIDEO",
      formatString: "HEVC",
      mediaFilename: "Johns Japanese CRT Adventure HEVC.mp4",
      encoding: "HEVC",
      videoProperties: makeVideoProps("4K", "60fps"),
      audioProperties: {
        encoding: "AAC",
        channels: "2.0",
        bitrate: 320000,
        sampleRate: 48000
      },
    }
  ],
  thumbnailUrl: "",
  youtubeVideoId: "",
  publishedDate: new Date("2021-01-01T00:14:00Z"),
  tags: [
    "retro",
    "japan",
    "crt",
    "john"
  ],
  source: "digitalfoundry",
  legacy: false,
  unpatchable: false,
}, {
  key: "dummy-df-direct-weekly-599",
  name: "df-direct-weekly-599",
  dataVersion: CURRENT_DATA_VERSION,
  title: "DF Direct Weekly 599",
  description: "Digital Foundry Direct Weekly 599 - that's right, the 599th DF Direct Weekly! Not sure this will go down as well as the 299th",
  mediaInfo: [
    {
      type: "VIDEO",
      formatString: "h264",
      mediaFilename: "DF Direct Weekly 599.mp4",
      encoding: "h264",
      videoProperties: makeVideoProps("1080p", "60fps"),
      audioProperties: {
        encoding: "AAC",
        channels: "2.0",
        bitrate: 320000,
        sampleRate: 48000
      },
    },
    {
      type: "VIDEO",
      formatString: "HEVC",
      mediaFilename: "DF Direct Weekly 599 HEVC.mp4",
      encoding: "HEVC",
      videoProperties: makeVideoProps("4K", "60fps"),
      audioProperties: {
        encoding: "AAC",
        channels: "2.0",
        bitrate: 320000,
        sampleRate: 48000
      },
    }
  ],
  thumbnailUrl: "",
  youtubeVideoId: "",
  tags: [
    "DF Direct",
  ],
  publishedDate: new Date("2032-10-09T17:12:01Z"),
  source: "digitalfoundry",
  legacy: false,
  unpatchable: false,
}, {
  key: "dummy-alexs-favorite-stutters-of-2025-year-in-review",
  name: "alexs-favorite-stutters-of-2025-year-in-review",
  dataVersion: CURRENT_DATA_VERSION,
  title: "Alex's Favorite Stutters of 2025 - Year in Review",
  description: "Alex goes through his favorite stutters of 2025 - with one stutter so long he managed to make a cup of tea!",
  mediaInfo: [
    {
      type: "VIDEO",
      formatString: "h264",
      mediaFilename: "Alexs Favorite Stutters of 2025.mp4",
      encoding: "h264",
      videoProperties: makeVideoProps("4K", "60fps"),
      audioProperties: {
        encoding: "AAC",
        channels: "2.0",
        bitrate: 320000,
        sampleRate: 48000
      },
    },
    {
      type: "VIDEO",
      formatString: "HEVC",
      mediaFilename: "Alexs Favorite Stutters of 2025 HEVC.mp4",
      encoding: "HEVC",
      videoProperties: makeVideoProps("4K", "60fps"),
      audioProperties: {
        encoding: "AAC",
        channels: "2.0",
        bitrate: 320000,
        sampleRate: 48000
      },
    },
    {
      type: "AUDIO",
      formatString: "MP3",
      mediaFilename: "Alexs Favorite Stutters of 2025 audio.mp3",
      encoding: "MP3",
      videoProperties: null,
      audioProperties: {
        channels: "2.0",
        bitrate: 320000,
        sampleRate: 48000,
        encoding: "MP3"
      }
    }
  ],
  thumbnailUrl: "",
  youtubeVideoId: "",
  publishedDate: new Date("2025-12-31T23:59:59Z"),
  source: "digitalfoundry",
  legacy: false,
  unpatchable: false,
}];

export const randomDummyContentInfo = (not?: string) => {
  const pool = not ? DummyContentInfos.filter((info) => info.name !== not) : DummyContentInfos;
  return pool[Math.floor(Math.random() * pool.length)];
};