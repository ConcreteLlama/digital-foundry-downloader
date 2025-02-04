import * as CSSSelect from "css-select";
import {
  DfContentInfo,
  DfContentInfoUtils,
  DfUserInfo,
  MediaInfo,
  MediaInfoUtils,
  fileSizeStringToBytes,
  logger,
  sanitizeFilename,
} from "df-downloader-common";
import { Document, Element } from "domhandler";
import htmlparser2 from "htmlparser2";
import { configService } from "./config/config.js";
import { sanitizeContentName } from "./utils/df-utils.js";
import { getBody, getBodyOfChild } from "./utils/dom-utils.js";
import { extractFilenameFromUrl } from "./utils/file-utils.js";
import { extractYoutubeVideoId } from "./utils/youtube.js";

type PageMeta = {
  publishedDate: Date;
  tags: string[];
  title: string;
  thumbnail: string;
  // description: string;
};
export type DfContentInfoReference = {
  title: string;
  name: string;
  link: string;
  thumbnail: string;
};

const dfBaseUrl = "https://www.digitalfoundry.net";

export const makeDfContentUrl = (name: string) => `${dfBaseUrl}/${name}`;

function extractMeta(elements: Element[]): PageMeta {
  const toReturn: PageMeta = {
    title: "",
    publishedDate: new Date(),
    tags: [],
    thumbnail: "",
  };
  elements.forEach((element) => {
    if (element instanceof Element) {
      const prop = element.attribs["property"];
      if (prop === "article:published_time") {
        if (element.attribs["content"]) toReturn.publishedDate = new Date(Date.parse(element.attribs["content"]));
      } else if (prop === "article:tag") {
        toReturn.tags.push(element.attribs["content"]);
      } else if (prop === "og:title") {
        toReturn.title = element.attribs["content"];
      } else if (prop === "og:image") {
        toReturn.thumbnail = element.attribs["content"];
      }
    }
  });
  toReturn.tags = toReturn.tags.sort((a, b) => a.localeCompare(b));
  return toReturn;
}

function extractDfUserInfo(dom: Document): DfUserInfo | undefined {
  const userProfile = CSSSelect.selectOne(".user_profile ", dom) as Element;
  if (!userProfile) {
    return undefined;
  }
  const classes = userProfile.attribs["class"].split(" ");
  if (!classes.includes("signed_in")) {
    return undefined;
  }
  const userInfoElement = CSSSelect.selectOne(".username", userProfile);
  if (!userInfoElement) {
    return undefined;
  }
  const username = getBody(".name", userInfoElement);
  const tier = getBody(".flair", userInfoElement);
  const avatarUrl = (CSSSelect.selectOne(".avatar_image", dom) as Element)?.attribs?.src;
  return username && tier
    ? {
        username: username,
        tier: tier,
        avatarUrl,
      }
    : undefined;
}

function makeAuthHeaders(sessionIdOverride?: string): Record<string, string> {
  const dfSessionId = sessionIdOverride || configService.config.digitalFoundry.sessionId;
  return dfSessionId
    ? {
        cookie: `sessionid=${dfSessionId};`,
      }
    : {};
}

function makeDfVideoUrl(videoName: string) {
  return `${dfBaseUrl}/${videoName}`;
}

export const makeDfDownloadParams = (dfContent: DfContentInfo, mediaInfo: MediaInfo) => {
  const filename = mediaInfo.mediaFilename || sanitizeFilename(`${dfContent.name}_${mediaInfo.mediaType}.${MediaInfoUtils.getExtension(mediaInfo)}`);
  const downloadDestination = `${configService.config.contentManagement.workDir}/${filename}`;
  const headers = {
    ...makeAuthHeaders(),
    "User-Agent": "DigitalFounload",
  };
  return {
    url: async () => getMediaUrl(dfContent.name, mediaInfo.mediaType),
    destination: downloadDestination,
    headers,
  };
};

export async function fetchFeedContentList() {
  const response = await fetch(`${dfBaseUrl}/feed`, {
    headers: {
      ...makeAuthHeaders(),
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.statusText}`);
  }
  const feed = htmlparser2.parseFeed(await response.text());
  if (!feed) {
    return [];
  }
  return feed.items.reduce((arr, cur) => {
    const thumbnail = cur.media.find((item) => item.type === "image/jpeg")?.url || "";
    if (cur.link && cur.title && cur.pubDate) {
      arr.push({
        link: cur.link!,
        name: sanitizeContentName(cur.link!),
        title: cur.title!,
        thumbnail,
      });
    }
    return arr;
  }, [] as DfContentInfoReference[]);
}

export async function fetchArchiveContentList(from: number = 1, to: number = Infinity) {
  const fullContentList: DfContentInfoReference[] = [];
  await forEachArchivePage(
    (contentReferences) => {
      fullContentList.push(...contentReferences);
      return true;
    },
    to,
    from
  );
}

export async function forEachArchivePage<T>(
  fn: (contentReferences: DfContentInfoReference[], pageIdx: number) => boolean | Promise<boolean>,
  from: number = 1,
  to: number = Infinity
) {
  let page = from;
  while (page <= to) {
    try {
      const pageContentList = await fetchArchivePageContentList(page);
      if (!pageContentList || pageContentList.length === 0) {
        return;
      }
      const cont = await fn(pageContentList, page);
      if (!cont) {
        return;
      }
      page++;
    } catch (e) {
      logger.log("error", `Unexpected HTTP error when fetching archive page content list page ${page}`, e);
      return;
    }
  }
}

export async function fetchArchivePageContentList(page: number = 1) {
  const archivePageUrl = `${dfBaseUrl}/archive?page=${page}`;
  logger.log("verbose", `Fetching list archive page ${page}: ${archivePageUrl}`);

  let response;
  try {
    response = await fetch(archivePageUrl, {
      headers: {
        ...makeAuthHeaders(),
      },
    });
  } catch (e) {
    logger.log("error", "Unexpected HTTP error when fetching archive page content list", e);
    return [];
  }
  if (!response.ok) {
    logger.log("error", `Failed to fetch archive page ${page}: ${response.statusText}`);
    return [];
  }
  const responseText = await response.text();
  const dom = htmlparser2.parseDocument(responseText);
  const contentList = CSSSelect.selectAll(".archive__items > .archive__item", dom);
  return contentList.reduce((toReturn, current) => {
    const archiveTitleLink = CSSSelect.selectOne(".archive__title a", current);
    if (!(archiveTitleLink instanceof Element)) {
      logger.log("verbose", `No archive title link element, skipping`);
      return toReturn;
    }
    const thumbElement = CSSSelect.selectOne(".archive__thumbnail > .thumbnail > img", current);
    const thumbnail = thumbElement instanceof Element ? thumbElement.attribs.src : "";
    const title = getBodyOfChild(archiveTitleLink);
    const { href } = archiveTitleLink.attribs;
    if (!href || !title) {
      logger.log("verbose", `Skipping - href is ${href} and title is ${title}`);
      return toReturn;
    }
    toReturn.push({
      title,
      link: href,
      name: sanitizeContentName(href),
      thumbnail,
    });
    logger.log("silly", `Found content: ${JSON.stringify(toReturn, null, 2)}`);
    return toReturn;
  }, [] as DfContentInfoReference[]);
}

export async function getMediaInfo(name: string): Promise<DfContentInfo> {
  logger.log("debug", "Getting info for media", name);
  const dfUrl = makeDfVideoUrl(name);
  const response = await fetch(dfUrl, {
    headers: {
      ...makeAuthHeaders(),
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch media info: ${response.statusText}`);
  }
  const dom = htmlparser2.parseDocument(await response.text());
  const metaElements = CSSSelect.selectAll("meta", dom);
  const meta = extractMeta(metaElements.filter((element) => element instanceof Element) as Element[]);
  const description =
    getBody("p", CSSSelect.selectOne("#content_above .article .article_body .article_body_content", dom)) || "";
  const youtubeIframeUrl = (CSSSelect.selectOne(".video_wrapper iframe", dom) as Element)?.attribs?.src;
  const youtubeVideoId = youtubeIframeUrl ? extractYoutubeVideoId(youtubeIframeUrl) : undefined;
  const article = CSSSelect.selectOne("#content_above .article", dom);
  const dataPaywalled = (article as Element).attribs["data-paywalled"] === "false" ? false : true;
  const videoInfoElements = CSSSelect.selectAll(".article_body .video_data_file", article);
  const mediaInfos: MediaInfo[] = [];
  for (const videoInfoElement of videoInfoElements) {
    const duration = getBody(".duration", videoInfoElement);
    let size = getBody(".size", videoInfoElement);
    try {
      fileSizeStringToBytes(size!);
    } catch (e) {
      size = "0";
    }
    const videoEncoding = getBody(".encoding_video", videoInfoElement);
    const mediaType = getBody(".name", videoInfoElement) || "";
    const audioEncoding = getBody(".encoding_audio", videoInfoElement);
    const aElements = CSSSelect.selectAll("a", videoInfoElement);
    let url: string | undefined = undefined;
    for (const aElement of aElements) {
      if (aElement instanceof Element) {
        const href = aElement.attribs["href"];
        if (href) url = href;
      }
    }
    const mediaFilename = url ? extractFilenameFromUrl(url) : undefined;
    mediaInfos.push({
      duration,
      size,
      mediaType,
      videoEncoding,
      audioEncoding,
      mediaFilename,
    });
  }
  return DfContentInfoUtils.create(
    name,
    meta.title,
    description,
    mediaInfos,
    meta.thumbnail,
    youtubeVideoId,
    dataPaywalled,
    meta.publishedDate,
    meta.tags
  );
}

export const getMediaUrl = async (name: string, desiredMediaType: string) => {
  const downloadUrlOverride = configService.getDevConfigField("downloadUrlOverride");
  if (downloadUrlOverride) {
    return `${downloadUrlOverride}/${name}.mp4`;
  }
  const dfUrl = makeDfVideoUrl(name);
  const response = await fetch(dfUrl, {
    headers: {
      ...makeAuthHeaders(),
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch media info: ${response.statusText}`);
  }
  const dom = htmlparser2.parseDocument(await response.text());
  const videoInfoElements = CSSSelect.selectAll(".article_body .video_data_file", dom);
  for (const videoInfoElement of videoInfoElements) {
    const videoType = getBody(".name", videoInfoElement);
    if (!videoType) continue;
    if (videoType === desiredMediaType) {
      const aElements = CSSSelect.selectAll("a", videoInfoElement);
      for (const aElement of aElements) {
        if (aElement instanceof Element) {
          const href = aElement.attribs["href"];
          if (href) return href;
        }
      }
    }
  }
};

export async function getDfUserInfo(sessionIdOverride?: string) {
  const response = await fetch(dfBaseUrl, {
    headers: {
      ...makeAuthHeaders(sessionIdOverride),
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.statusText}`);
  }
  const dom = htmlparser2.parseDocument(await response.text());
  const userInfo = extractDfUserInfo(dom);
  return userInfo;
}
