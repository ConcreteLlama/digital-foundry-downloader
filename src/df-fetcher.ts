import * as CSSSelect from "css-select";
import { Document, Element, Text } from "domhandler";
import got from "got";
import htmlparser2 from "htmlparser2";
import stream from "node:stream";
import { promisify } from "node:util";
import { Config } from "./config.js";
import { DigitalFoundryContentManager } from "./df-content-manager.js";
import { DfContent, MediaInfo } from "./df-types.js";
import { download, DownloadProgressReport } from "./downloader.js";
import { Logger, LogLevel } from "./logger.js";
import fs from "fs";

const pipeline = promisify(stream.pipeline);
type PageMeta = {
  publishedDate: Date;
  tags: string[];
  title: string;
  description: string;
};
type FeedResult = {
  title: string;
  link: string;
  pubDate: Date;
};
//TODO: Make this configurable
const progressReportInterval = 60000;

export class DigitalFoundryFetcher {
  readonly logger: Logger;
  dfBaseUrl: string = "https://www.digitalfoundry.net";

  constructor(private config: Config, private contentManager: DigitalFoundryContentManager) {
    this.logger = config.logger;
  }

  // async getContentList() {
  //     const urlStartStr = 'https://example.com/'
  //     const response = await got.get(`${this.dfBaseUrl}/sitemap.xml`)
  //     const dom = htmlparser2.parseDocument(response.body)
  //     const urls: string[] = []
  //     const result = CSSSelect.selectAll("loc", dom)
  //     result.forEach((doc) => {
  //         const urlField = doc.firstChild
  //         if (urlField instanceof Text) {
  //             urls.push(urlField.data)
  //         }
  //     })
  //     return urls.filter((url) => url.startsWith(urlStartStr)).map((url) => url.substring(urlStartStr.length))
  // }

  extractMeta(elements: Element[]): PageMeta {
    const toReturn: PageMeta = {
      title: "",
      description: "",
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
        } else if (prop === "og:description") {
          toReturn.description = element.attribs["content"];
        } else if (prop === "og:title") {
          toReturn.title = element.attribs["content"];
        }
      }
    });
    return toReturn;
  }

  async getMediaInfo(name: string): Promise<DfContent> {
    this.logger.log(LogLevel.DEBUG, "Getting info for media", name);
    const dfUrl = this.makeDfVideoUrl(name);
    const response = await got.get(dfUrl, {
      headers: {
        ...this.makeAuthHeaders(),
      },
    });
    const dom = htmlparser2.parseDocument(response.body);
    const metaElements = CSSSelect.selectAll("meta", dom);
    const meta = this.extractMeta(metaElements.filter((element) => element instanceof Element) as Element[]);
    const videoInfoElements = CSSSelect.selectAll("#content_above .article .article_body .video_data_file", dom);
    const mediaInfos = videoInfoElements.map((videoInfoElement): MediaInfo => {
      const duration = this.getBody(".duration", videoInfoElement);
      const size = this.getBody(".size", videoInfoElement);
      const videoEncoding = this.getBody(".encoding_video", videoInfoElement);
      const mediaType = this.getBody(".name", videoInfoElement) || "";
      const audioEncoding = this.getBody(".encoding_audio", videoInfoElement);
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
    return new DfContent(name, meta.title, meta.description, mediaInfos, meta.publishedDate, meta.tags);
  }

  extractMormontMeta(document: string) {
    const publishedMatch = document.match("mormont\\('set', *'published', *'(.*)'\\);");
    const publishedDate = publishedMatch && publishedMatch[1] ? new Date(Date.parse(publishedMatch[1])) : undefined;
    const tagsMatch = document.match("mormont\\('set', *'tags', *\\[(.*)\\]\\);");
    const tagsStr = `${tagsMatch && tagsMatch[1] ? tagsMatch[1] : ""}`;
    let tags = tagsStr
      .replace(/\'/g, "")
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag && tag.length > 0)
      .map((tag) => tag.replace(/tag:/g, ""));
    return {
      publishedDate,
      tags,
    };
  }

  async downloadMedia(dfContent: DfContent, mediaInfo: MediaInfo) {
    this.logger.log(LogLevel.DEBUG, `Downloading video ${dfContent.name} at URL ${mediaInfo.url}`);
    if (!mediaInfo.url) {
      this.logger.log(LogLevel.DEBUG, `Media info for ${dfContent.name} has no URL, returning`);
      return;
    }
    const filename = dfContent.makeFileName(mediaInfo);
    const downloadDestination = `${this.config.workDir}/${filename}`;
    const baseHeaders = {
      ...this.makeAuthHeaders(),
      "User-Agent": "DigitalFounload",
    };
    await download(this.logger, mediaInfo.url, downloadDestination, {
      headers: baseHeaders,
      progressListener: (progressUpdate: DownloadProgressReport) => {
        dfContent.progress = progressUpdate;
        this.contentManager.progressUpdate(dfContent, mediaInfo, progressUpdate);
      },
      maxResumeAttempts: 20,
    });
    this.logger.log(LogLevel.DEBUG, `Download done for ${dfContent.name}`);

    return downloadDestination;
  }

  async fetchFeed() {
    const response = await got.get(`${this.dfBaseUrl}/feed`, {
      headers: {
        ...this.makeAuthHeaders(),
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
          pubDate: cur.pubDate!,
        });
      }
      return arr;
    }, [] as FeedResult[]);
  }

  // TODO: Parse sitemap + list all historical (probably unnecessary)
  /*
  async fetchHistoricalContent() {
    const response = await got.get(`${this.dfBaseUrl}/sitemap.xml`, {
      headers: {
        ...this.makeAuthHeaders(),
      },
    });
    const sitemap = htmlparser2.parseDocument(response.body);
  }*/

  makeAuthHeaders() {
    return {
      cookie: `sessionid=${this.config.sessionId};`,
    };
  }

  getBodyOfChild(element?: Document | null) {
    if (!element) {
      return;
    }
    const textElement = element.children.find((element) => element instanceof Text);
    if (!textElement) {
      return;
    }
    return (textElement as Text).data.trim();
  }

  getBody(selector: string, parent?: Document | null) {
    const element = CSSSelect.selectOne(selector, parent);
    return this.getBodyOfChild(element);
  }

  makeDfVideoUrl(videoName: string) {
    return `${this.dfBaseUrl}/${videoName}`;
  }

  makeFilename(name: string, mediaInfo: MediaInfo) {
    const extension = mediaInfo.mediaType === "MP3" ? "mp3" : "mp4";
    return `${name}.${extension}`;
  }
}
