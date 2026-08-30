import { DfArticleLinkedVideo, DfArticleListingItem, DfArticleListingResponse, logger } from "df-downloader-common";
import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { sendError, sendResponse } from "../utils/utils.js";

/**
 * The articles this installation knows about, and what they link to.
 *
 * Two stores hold articles and they hold different things, which is easy to
 * get wrong - reading only one of them makes the list look empty on an
 * install that plainly has articles attached to its content:
 *
 * - The **article store** records the outcome of matching a companion
 *   article to a piece of content, keyed by content. An entry with
 *   `hasArticle` is a confirmed companion, verified by checking the page
 *   embeds that exact video, and is the one an analysis is grounded on.
 * - The **metadata cache** records what was learned about any page that was
 *   read along the way, keyed by URL - the pieces the periodic scan has
 *   seen, plus every candidate weighed during a search. It knows the author
 *   and every video a page embeds; it does not know whether the page was
 *   chosen for anything.
 *
 * Both are merged here by URL, so a confirmed companion carries the richer
 * metadata when the cache also has it, and neither store's contents go
 * missing from the list.
 *
 * Nothing is fetched: every field was already stored while matching, so
 * browsing this costs Digital Foundry nothing however often it is opened.
 * That also bounds the list honestly - it is what this app has come across,
 * not the full archive, and the page says so.
 */
const slugFromUrl = (url: string): string => {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? url;
  } catch {
    return url;
  }
};

type Draft = {
  url: string;
  slug: string;
  title: string;
  author?: string;
  lastmod?: Date;
  cachedAt: Date;
  videoIds: string[];
  /** Content this article was confirmed to be the companion for. */
  companionForKeys: Set<string>;
};

export const makeDfArticlesRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();

  router.get("/", async (_req: Request, res: Response) => {
    try {
      const entries = await contentManager.db.getAllContentEntries();

      // One pass over the library rather than a scan per article.
      const byVideoId = new Map<string, (typeof entries)[number]>();
      const byContentKey = new Map<string, (typeof entries)[number]>();
      for (const entry of entries) {
        byContentKey.set(entry.contentInfo.key, entry);
        const videoId = entry.contentInfo.youtubeVideoId;
        if (videoId) {
          byVideoId.set(videoId, entry);
        }
      }

      const drafts = new Map<string, Draft>();

      for (const meta of contentManager.db.listDfArticleMeta()) {
        drafts.set(meta.url, {
          url: meta.url,
          slug: meta.slug,
          title: meta.title,
          author: meta.author,
          lastmod: meta.lastmod,
          cachedAt: meta.cachedAt,
          videoIds: meta.videoIds,
          companionForKeys: new Set(),
        });
      }

      for (const [contentKey, index] of Object.entries(contentManager.db.getAllDfArticleIndexEntries())) {
        if (!index.hasArticle || !index.url) {
          continue;
        }
        const existing = drafts.get(index.url);
        if (existing) {
          existing.companionForKeys.add(contentKey);
          continue;
        }
        drafts.set(index.url, {
          url: index.url,
          slug: slugFromUrl(index.url),
          title: index.title ?? slugFromUrl(index.url),
          // The store records when it was matched, not when the page was
          // written; it is the only date this side has.
          cachedAt: index.lastAttemptedAt,
          videoIds: [],
          companionForKeys: new Set([contentKey]),
        });
      }

      const listing: DfArticleListingItem[] = [...drafts.values()]
        .map((draft) => {
          const linked = new Map<string, DfArticleLinkedVideo>();
          const add = (entry: (typeof entries)[number] | undefined, videoId?: string) => {
            if (!entry) {
              return;
            }
            linked.set(entry.contentInfo.key, {
              contentKey: entry.contentInfo.key,
              title: entry.contentInfo.title,
              youtubeVideoId: videoId ?? entry.contentInfo.youtubeVideoId ?? "",
              downloaded: (entry.downloads ?? []).length > 0,
              thumbnailUrl: entry.contentInfo.thumbnailUrl || undefined,
            });
          };
          // Confirmed companions first - those are matches this app made and
          // verified, rather than "this page happens to embed that video".
          for (const contentKey of draft.companionForKeys) {
            add(byContentKey.get(contentKey));
          }
          for (const videoId of draft.videoIds) {
            add(byVideoId.get(videoId), videoId);
          }
          return {
            url: draft.url,
            slug: draft.slug,
            title: draft.title,
            author: draft.author,
            lastmod: draft.lastmod,
            cachedAt: draft.cachedAt,
            videoIds: draft.videoIds,
            linkedVideos: [...linked.values()],
          };
        })
        .sort((a, b) => (b.lastmod ?? b.cachedAt).getTime() - (a.lastmod ?? a.cachedAt).getTime());

      const response: DfArticleListingResponse = { articles: listing };
      return sendResponse(res, response);
    } catch (e) {
      logger.log("error", `Failed to list articles: ${e}`);
      return sendError(res, "Could not read the article list", 500);
    }
  });

  return router;
};
