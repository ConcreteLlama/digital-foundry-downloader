import * as CSSSelect from "css-select";
import { Document, Element } from "domhandler";
import got, { HTTPError } from "got";
import htmlparser2 from "htmlparser2";
import { config } from "./config/config.js";
import { UserInfo } from "./db/df-operational-db.js";
import { DfContent, MediaInfo } from "./df-types.js";
import { download, ProgressListener } from "./downloader.js";
import { LogLevel } from "./logger.js";
import { getBody } from "./utils/dom-utils.js";

type PageMeta = {
  publishedDate: Date;
  tags: string[];
  title: string;
  // description: string;
};
type ContentReference = {
  title: string;
  link: string;
};
//TODO: Make this configurable
const progressReportInterval = 60000;
const dfBaseUrl = "https://www.digitalfoundry.net";
const logger = config.logger;

function extractMeta(elements: Element[]): PageMeta {
  const toReturn: PageMeta = {
    title: "",
    publishedDate: new Date(),
    tags: [],
  };
  elements.forEach((element) => {
    if (element instanceof Element) {
      const prop = element.attribs["property"];
      if (prop === "article:published_time") {
        element.attribs["content"] && toReturn.publishedDate === new Date(Date.parse(element.attribs["content"]));
      } else if (prop === "article:tag") {
        toReturn.tags.push(element.attribs["content"]);
      } else if (prop === "og:title") {
        toReturn.title = element.attribs["content"];
      }
    }
  });
  return toReturn;
}

function extractUserInfo(dom: Document): UserInfo | undefined {
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
  return {
    username: username || "unknown",
    tier: tier || "unknown",
  };
}

function makeAuthHeaders() {
  return {
    cookie: `sessionid=${config.sessionId};`,
  };
}

function makeDfVideoUrl(videoName: string) {
  return `${dfBaseUrl}/${videoName}`;
}

export async function downloadMedia(dfContent: DfContent, mediaInfo: MediaInfo, progressListener?: ProgressListener) {
  logger.log(LogLevel.DEBUG, `Downloading video ${dfContent.name} at URL ${mediaInfo.url}`);
  if (!mediaInfo.url) {
    logger.log(LogLevel.DEBUG, `Media info for ${dfContent.name} has no URL, returning`);
    return;
  }
  const filename = dfContent.makeFileName(mediaInfo);
  const downloadDestination = `${config.workDir}/${filename}`;
  const baseHeaders = {
    ...makeAuthHeaders(),
    "User-Agent": "DigitalFounload",
  };
  await download(logger, mediaInfo.url, downloadDestination, {
    headers: baseHeaders,
    progressListener,
    maxResumeAttempts: 20,
  });
  logger.log(LogLevel.DEBUG, `Download done for ${dfContent.name}`);

  return downloadDestination;
}

export async function fetchFeedContentList() {
  const response = await got.get(`${dfBaseUrl}/feed`, {
    headers: {
      ...makeAuthHeaders(),
    },
  });
  const feed = htmlparser2.parseFeed(response.body);
  if (!feed) {
    return [];
  }
  return feed.items.reduce((arr, cur) => {
    if (cur.link && cur.title && cur.pubDate) {
      arr.push({
        link: cur.link!,
        title: cur.title!,
      });
    }
    return arr;
  }, [] as ContentReference[]);
}

export async function fetchArchiveContentList(from: number = 1, to: number = Infinity) {
  const fullContentList: ContentReference[] = [];
  let page = from;
  while (page <= to) {
    try {
      const pageContentList = await fetchArchivePageContentList(page);
      if (!pageContentList || pageContentList.length === 0) {
        return fullContentList;
      }
      fullContentList.push(...pageContentList);
      page++;
    } catch (e) {
      logger.log(LogLevel.ERROR, `Unexpected HTTP error when fetching archive page content list page ${page}`, e);
      return fullContentList;
    }
  }
  return fullContentList;
}

export async function fetchArchivePageContentList(page: number = 1) {
  logger.log(LogLevel.VERBOSE, `Fetching list archive page ${page}`);
  const archivePageUrl = `${dfBaseUrl}/archive?page=${page}`;
  let response;
  try {
    response = await got.get(archivePageUrl, {
      headers: {
        ...makeAuthHeaders(),
      },
    });
  } catch (e) {
    if (e instanceof HTTPError) {
      if (e.response.statusCode === 404) {
        logger.log(LogLevel.INFO, `No archive content on page ${page} - must have reached end of content list`);
      } else {
        logger.log(LogLevel.ERROR, "Unexpected HTTP error when fetching archive page content list", e);
      }
      return [];
    }
    logger.log(LogLevel.ERROR, "Unexpected error when fetching archive page content list", e);
    return [];
  }
  const dom = htmlparser2.parseDocument(response.body);
  const contentList = CSSSelect.selectAll(".archive_list > .summary_list li > .summary > a", dom);
  return contentList.reduce((toReturn, current) => {
    if (!(current instanceof Element)) {
      return toReturn;
    }
    const { href, title } = current.attribs;
    if (!href || !title) {
      return toReturn;
    }
    toReturn.push({
      title,
      link: href,
    });
    return toReturn;
  }, [] as ContentReference[]);
}

export async function getMediaInfo(name: string): Promise<DfContent> {
  logger.log(LogLevel.DEBUG, "Getting info for media", name);
  const dfUrl = makeDfVideoUrl(name);
  const response = await got.get(dfUrl, {
    headers: {
      ...makeAuthHeaders(),
    },
  });
  const dom = htmlparser2.parseDocument(response.body);
  const metaElements = CSSSelect.selectAll("meta", dom);
  const meta = extractMeta(metaElements.filter((element) => element instanceof Element) as Element[]);
  const description =
    getBody("p", CSSSelect.selectOne("#content_above .article .article_body .article_body_content", dom)) || "";
  const article = CSSSelect.selectOne("#content_above .article", dom);
  const dataPaywalled = (article as Element).attribs["data-paywalled"] === "false" ? false : true;
  const videoInfoElements = CSSSelect.selectAll(".article_body .video_data_file", article);
  const mediaInfos = videoInfoElements.map((videoInfoElement): MediaInfo => {
    const duration = getBody(".duration", videoInfoElement);
    const size = getBody(".size", videoInfoElement);
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
    return {
      duration,
      size,
      mediaType,
      videoEncoding,
      audioEncoding,
      url,
    };
  });
  return new DfContent(name, meta.title, description, mediaInfos, dataPaywalled, meta.publishedDate, meta.tags);
}

export async function getUserInfo() {
  const response = await got.get(dfBaseUrl, {
    headers: {
      ...makeAuthHeaders(),
    },
  });
  const dom = htmlparser2.parseDocument(response.body);
  const userInfo = extractUserInfo(dom);
  return userInfo;
}
