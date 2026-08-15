import * as cheerio from "cheerio";
import {
  DfContentAvailability,
  DfContentInfo,
  DfContentInfoUtils,
  DfUserInfo,
  MediaInfo,
  MediaInfoUtils,
  createMediaInfoFromNewSiteListing,
  logger,
  sanitizeFilename,
  slugifyTitle,
} from "df-downloader-common";
import { configService } from "./config/config.js";
import { dfFetch } from "./df-request-queue.js";

/**
 * Scraper for the post-relaunch digitalfoundry.net (new CMS, new auth, new
 * `/videos` archive - see docs/DF_SITE_MIGRATION.md for how this was
 * reverse-engineered and what's still unverified).
 */

export type DfContentInfoReference = {
  title: string;
  name: string;
  link: string;
  thumbnail: string;
};

const dfBaseUrl = "https://www.digitalfoundry.net";
const listingApiUrl = `${dfBaseUrl}/api/1.0/listing`;

/** The new site has no per-video DF-hosted page - every video links straight to YouTube. */
export const makeDfContentUrl = (name: string) => `https://www.youtube.com/watch?v=${name}`;

function makeAuthHeaders(autologinOverride?: string): Record<string, string> {
  const autologin = autologinOverride || configService.config.digitalFoundry.sessionId;
  return autologin
    ? {
      cookie: `autologin=${autologin};`,
    }
    : {};
}

type ListingApiResponse = {
  status: string;
  page: number;
  pages: number;
  items: string[];
  query: string;
};

type ListingQueryOpts = {
  limit?: number;
  offset?: number;
  category?: string;
  year?: number;
  title?: string;
  /** Bypass configService - mirrors getDfUserInfo's override, useful for testing/the "test connection" flow. */
  autologinOverride?: string;
};

async function fetchListingPage(opts: ListingQueryOpts = {}): Promise<ListingApiResponse> {
  const { limit = 50, offset = 0, category, year, title, autologinOverride } = opts;
  const params = new URLSearchParams({
    auth: "true",
    id: "videos",
    type: "df-videos",
    limit: String(limit),
    offset: String(offset),
  });
  if (category) params.set("category", category);
  if (year) params.set("year", String(year));
  if (title) params.set("title", title);
  const response = await dfFetch(`${listingApiUrl}?${params.toString()}`, {
    headers: {
      ...makeAuthHeaders(autologinOverride),
      accept: "*/*",
      "x-requested-with": "XMLHttpRequest",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch listing page (offset ${offset}): ${response.statusText}`);
  }
  return (await response.json()) as ListingApiResponse;
}

function extractYoutubeIdFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("v");
  } catch {
    return null;
  }
}

/**
 * Parse one `<li class="item-df-video">` fragment (as returned inside the
 * `items` array of the listing API, or embedded directly in the `/videos`
 * page) into a full DfContentInfo - the new site's listing already contains
 * everything (title, thumbnail, date, every download format/size/link), so
 * unlike the old site there's no separate per-video detail page to fetch.
 */
function extractDownloadId(downloadPath: string): number | null {
  const match = downloadPath.match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : null;
}

function extractMediaId(thumbnailUrl: string): number | null {
  const match = thumbnailUrl.match(/\/media\/(\d+)\//);
  return match ? parseInt(match[1], 10) : null;
}

function parseListingItem(itemHtml: string): DfContentInfo | null {
  const $ = cheerio.load(itemHtml);
  const titleLink = $(".info .heading a.title").first();
  const href = titleLink.attr("href");
  const title = titleLink.text().trim();
  if (!href || !title) {
    logger.log("verbose", "Skipping listing item - missing title/link");
    return null;
  }
  const youtubeVideoId = extractYoutubeIdFromUrl(href);
  const thumbnail = $(".image img").first().attr("src") || "";
  const datetimeAttr = $(".info ul.list time").first().attr("datetime");
  const publishedDate = datetimeAttr ? new Date(datetimeAttr) : new Date();

  const mediaInfos: MediaInfo[] = [];
  const downloadIds: number[] = [];
  $(".info ul.downloads > li > a.external").each((_i, el) => {
    const $link = $(el);
    const downloadPath = $link.attr("href");
    // A literal "login" href means this account isn't entitled to this
    // download (see the auth section of docs/DF_SITE_MIGRATION.md) - treat
    // it as unavailable rather than a real download.
    if (!downloadPath || downloadPath === "login") {
      return;
    }
    const formatLabel = $link.contents().first().text().trim();
    const metaText = $link.find("em").text().trim();
    if (!formatLabel) {
      return;
    }
    mediaInfos.push(createMediaInfoFromNewSiteListing(formatLabel, metaText, downloadPath));
    const downloadId = extractDownloadId(downloadPath);
    if (downloadId !== null) {
      downloadIds.push(downloadId);
    }
  });

  // Prefer the YouTube video ID as identity (matches what old-site scrapes
  // already cached for most existing DB entries - see the "Backward
  // compatibility" section of docs/DF_SITE_MIGRATION.md). Fall back to the
  // lowest of this content's own download-link IDs when there's no YouTube
  // link; these were confirmed stable across re-scans and don't shift when
  // new formats get added later. If neither is available there's genuinely
  // nothing to key this content on - skip it loudly rather than silently
  // dropping it, since (per the same doc) DF publishing YouTube-less content
  // that also has no downloads yet is the one case we can't identify at all.
  let key: string;
  if (youtubeVideoId) {
    key = `yt-${youtubeVideoId}`;
  } else if (downloadIds.length > 0) {
    key = `dl-${Math.min(...downloadIds)}`;
  } else {
    logger.log(
      "warn",
      `Skipping listing item "${title}" - no YouTube video ID and no download links to derive a key from`
    );
    return null;
  }

  // Cheap insurance against the site's schema changing later (e.g. dropping
  // YouTube links) - collected but intentionally never used for lookups/dedup.
  const mediaId = extractMediaId(thumbnail);
  const possibleAltKeys = Array.from(
    new Set([
      ...downloadIds.map((id) => `dl-${id}`),
      ...(mediaId !== null ? [`mediaId-${mediaId}`] : []),
    ].filter((altKey) => altKey !== key))
  );

  const name = slugifyTitle(title);

  return DfContentInfoUtils.create(
    key,
    name,
    title,
    undefined,
    mediaInfos,
    thumbnail,
    youtubeVideoId || undefined,
    publishedDate,
    [],
    "digitalfoundry",
    possibleAltKeys
  );
}

/**
 * parseListingItem, but never throws - one malformed item (an unexpected
 * media-size/resolution format, etc.) shouldn't take down an entire page's
 * worth of otherwise-good items, or a whole archive scan. Confirmed live
 * 2026-08-15: a single item's size string crashed parseListingItem and
 * silently killed the entire scan partway through.
 */
function parseListingItemSafe(itemHtml: string, pageContext: string): DfContentInfo | null {
  try {
    return parseListingItem(itemHtml);
  } catch (e) {
    logger.log("error", `Failed to parse listing item (${pageContext}) - skipping it`, e);
    return null;
  }
}

export type FetchedContentInfo = {
  contentInfo: DfContentInfo;
  availability: DfContentAvailability;
};

function toFetchedContentInfo(contentInfo: DfContentInfo): FetchedContentInfo {
  // The listing only ever contains real download links for content this
  // account is entitled to (parseListingItem drops "login"-gated ones), so no
  // media info at all means paywalled/not-yet-available rather than an error.
  return {
    contentInfo,
    availability:
      contentInfo.mediaInfo.length > 0 ? DfContentAvailability.AVAILABLE : DfContentAvailability.PAYWALLED,
  };
}

/**
 * Walk pages of the `/videos` listing, newest first, calling `fn` with the
 * full DfContentInfo for each page. Return `false` from `fn` to stop early.
 *
 * No manual delay between pages here - every request (from this loop or any
 * other caller) is serialized and spaced by the shared dfFetch queue (see
 * df-request-queue.ts), which also transparently backs off on 429/503.
 */
export async function forEachListingPage(
  fn: (contentInfos: DfContentInfo[], pageIdx: number) => boolean | Promise<boolean>,
  opts: ListingQueryOpts = {}
) {
  const limit = opts.limit ?? 50;
  let offset = opts.offset ?? 0;
  let pageIdx = 1;
  let pages = Infinity;
  while (offset / limit < pages) {
    let response: ListingApiResponse;
    try {
      response = await fetchListingPage({ ...opts, limit, offset });
    } catch (e) {
      logger.log("error", `Unexpected HTTP error when fetching listing page (offset ${offset})`, e);
      return;
    }
    pages = response.pages;
    const contentInfos = response.items
      .map((itemHtml) => parseListingItemSafe(itemHtml, `page ${pageIdx}`))
      .filter((info): info is DfContentInfo => info !== null);
    const cont = await fn(contentInfos, pageIdx);
    if (!cont) {
      return;
    }
    offset += limit;
    pageIdx++;
  }
}

const MAX_FALLBACK_SCAN_PAGES = 5;

/**
 * Best-effort lookup of a single already-known piece of content by key
 * (see DfContentInfo.key) - used to refresh a specific entry (stale
 * dataVersion, manual "refresh metadata"). The new site has no per-item
 * lookup endpoint, so this searches by title first (callers refreshing an
 * existing DB entry have one) and falls back to scanning the most recent
 * pages of the unfiltered listing. This is inherently approximate for older
 * content that doesn't turn up in either - see docs/DF_SITE_MIGRATION.md.
 */
async function findContentInfoByKey(key: string, titleHint?: string): Promise<DfContentInfo | undefined> {
  if (titleHint) {
    const response = await fetchListingPage({ limit: 50, title: titleHint });
    // A title with zero matches on the live API comes back without an
    // `items` field at all rather than an empty array - confirmed live
    // 2026-08-15 (was crashing every such lookup with a "reading 'map' of
    // undefined" TypeError).
    const match = (response.items || [])
      .map((itemHtml) => parseListingItemSafe(itemHtml, `title search "${titleHint}"`))
      .find((info) => info?.key === key);
    if (match) {
      return match;
    }
  }
  let found: DfContentInfo | undefined;
  let scannedPages = 0;
  await forEachListingPage((contentInfos) => {
    scannedPages++;
    found = contentInfos.find((info) => info.key === key);
    return !found && scannedPages < MAX_FALLBACK_SCAN_PAGES;
  });
  return found;
}

export async function fetchContentInfo(key: string, titleHint?: string): Promise<FetchedContentInfo> {
  logger.log("debug", "Getting info for media", key);
  const found = await findContentInfoByKey(key, titleHint);
  if (!found) {
    throw new Error(`Could not locate content info for ${key}${titleHint ? ` ("${titleHint}")` : ""}`);
  }
  return toFetchedContentInfo(found);
}

/**
 * Download links from the listing are already the real (cookie-gated,
 * redirect-to-signed-CDN-URL) URLs - `mediaInfo.downloadUrl` is populated
 * directly by parseListingItem, so this is only a fallback for entries that
 * predate that (e.g. not yet migrated/refreshed).
 */
export const getMediaUrl = async (contentInfo: DfContentInfo, desiredMediaFormat: string) => {
  const mediaInfo = contentInfo.mediaInfo.find((m) => m.formatString === desiredMediaFormat);
  return mediaInfo?.downloadUrl;
};

export const makeDfDownloadParams = (dfContent: DfContentInfo, mediaInfo: MediaInfo) => {
  const filename =
    mediaInfo.mediaFilename ||
    sanitizeFilename(`${dfContent.name}_${mediaInfo.formatString}.${MediaInfoUtils.getExtension(mediaInfo)}`);
  const downloadDestination = `${configService.config.contentManagement.workDir}/${filename}`;
  const headers = {
    ...makeAuthHeaders(),
    "User-Agent": "DigitalFounload",
  };
  return {
    url: async () => mediaInfo.downloadUrl || (await getMediaUrl(dfContent, mediaInfo.formatString)),
    destination: downloadDestination,
    headers,
  };
};

function extractDfUserInfo(html: string): DfUserInfo | undefined {
  const match = html.match(/var dgpConfig\s*=\s*(\{.*?\});/);
  if (!match) {
    return undefined;
  }
  let dgpConfig: any;
  try {
    dgpConfig = JSON.parse(match[1]);
  } catch (e) {
    logger.log("debug", "Failed to parse dgpConfig JSON while extracting DF user info", e);
    return undefined;
  }
  const user = dgpConfig?.user;
  if (!user || user.subscriber !== true || !user.tier) {
    return undefined;
  }
  return {
    username: user.title,
    tier: user.tier,
    avatarUrl: undefined,
  };
}

/**
 * Checks whether the configured autologin cookie currently authenticates as a
 * subscriber. "Not signed in" is a normal, expected outcome here (no cookie
 * configured yet, an invalid/expired one, or a transient failure reaching the
 * site) - always resolves to undefined in that case rather than throwing, so
 * callers (DfUserManager's startup check, its periodic recheck, and the
 * config-update listener that reacts to the user pasting a new cookie) don't
 * need their own error handling for what is the default state for a fresh
 * install. Confirmed empirically: the site returns 403 Forbidden (not just a
 * logged-out 200) for a syntactically-present-but-invalid cookie value.
 */
export async function getDfUserInfo(sessionIdOverride?: string): Promise<DfUserInfo | undefined> {
  let response: Response;
  try {
    response = await dfFetch(`${dfBaseUrl}/videos`, {
      headers: {
        ...makeAuthHeaders(sessionIdOverride),
      },
    });
  } catch (e) {
    logger.log("warn", "Failed to reach digitalfoundry.net while checking auth status - treating as not signed in", e);
    return undefined;
  }
  if (!response.ok) {
    const isExpectedAuthRejection = response.status === 401 || response.status === 403;
    logger.log(
      isExpectedAuthRejection ? "debug" : "warn",
      `digitalfoundry.net returned ${response.status} while checking auth status - treating as not signed in`
    );
    return undefined;
  }
  const dom = await response.text();
  return extractDfUserInfo(dom);
}
