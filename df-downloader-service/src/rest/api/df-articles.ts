import { DfArticleLinkedVideo, DfArticleListingItem, DfArticleListingResponse, logger } from "df-downloader-common";
import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { sendError, sendResponse } from "../utils/utils.js";

/**
 * The articles this installation knows about, and what they link to.
 *
 * Read entirely from the metadata cache, so browsing costs Digital Foundry
 * nothing - every entry was already fetched and kept while matching
 * articles to videos (see db/df-article-meta-cache.ts). That also sets the
 * honest scope of this list: it is what the app has encountered, being the
 * pieces the periodic scan has read plus every candidate weighed during a
 * search. It is not DF's whole archive and the UI says so rather than
 * implying completeness.
 *
 * The join to content happens here rather than in the browser because the
 * client has no reason to hold the whole library to resolve a handful of
 * video ids per row.
 */
export const makeDfArticlesRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();

  router.get("/", async (_req: Request, res: Response) => {
    try {
      const articles = contentManager.db.listDfArticleMeta();
      const entries = await contentManager.db.getAllContentEntries();

      // One pass over the library, rather than a scan per article.
      const byVideoId = new Map<string, (typeof entries)[number]>();
      for (const entry of entries) {
        const videoId = entry.contentInfo.youtubeVideoId;
        if (videoId) {
          byVideoId.set(videoId, entry);
        }
      }

      const listing: DfArticleListingItem[] = articles.map((article) => {
        const linkedVideos: DfArticleLinkedVideo[] = article.videoIds.flatMap((videoId) => {
          const entry = byVideoId.get(videoId);
          if (!entry) {
            // Embedded, but not something this library has - DF publish
            // plenty outside what has been scanned.
            return [];
          }
          return [
            {
              contentKey: entry.contentInfo.key,
              title: entry.contentInfo.title,
              youtubeVideoId: videoId,
              downloaded: (entry.downloads ?? []).length > 0,
            },
          ];
        });
        return {
          url: article.url,
          slug: article.slug,
          title: article.title,
          author: article.author,
          lastmod: article.lastmod,
          cachedAt: article.cachedAt,
          videoIds: article.videoIds,
          linkedVideos,
        };
      });

      const response: DfArticleListingResponse = { articles: listing };
      return sendResponse(res, response);
    } catch (e) {
      logger.log("error", `Failed to list articles: ${e}`);
      return sendError(res, "Could not read the article list", 500);
    }
  });

  return router;
};
