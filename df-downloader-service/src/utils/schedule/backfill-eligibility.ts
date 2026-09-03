import { DfContentEntry, DfContentEntryUtils } from "df-downloader-common";
import { ScheduledBackfillEligibilityConfig } from "df-downloader-common/config/ai-analysis-config.js";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";

export type EligibilitySurvey = {
  /**
   * Everything the feeder may pick up, newest first.
   *
   * Newest first because a back catalogue is worked through from the end you
   * still remember: an item published last week is the one you are most likely
   * to want a summary of, and an overnight window will rarely get through
   * everything. The whole list is returned rather than just the head so the
   * settings panel can say how many there are without asking twice.
   */
  items: DfContentEntry[];
  /**
   * Why the list is empty, when it is. "Nothing eligible" on its own reads
   * like a fault rather than a finished job, so this says which of the two
   * it is.
   */
  emptyReason?: string;
};

/** How the conditions read back in a sentence, for the empty message. */
const describeConditions = (eligibility: ScheduledBackfillEligibilityConfig): string => {
  const conditions: string[] = [];
  if (eligibility.requireSubtitles) {
    conditions.push("subtitles");
  }
  if (eligibility.requireArticle) {
    conditions.push("an article");
  }
  return conditions.length ? conditions.join(" and ") : "a download";
};

/**
 * Which items a scheduled window may analyse, and why there are none when
 * there are none.
 *
 * Every input is already in memory - the analysis index and the article index
 * are both held precisely so list views can ask per row - so this is a scan
 * over the library rather than anything expensive, and it is recomputed each
 * tick rather than decided once when the window opened. That matters: an
 * article can arrive at 2am, and a feeder that fixed its list at midnight
 * could not notice.
 */
export const surveyEligibleContent = async (
  db: DfDownloaderOperationalDb,
  eligibility: ScheduledBackfillEligibilityConfig,
  now: Date = new Date()
): Promise<EligibilitySurvey> => {
  const entries = await db.getAllContentEntries();
  const analysisIndex = db.getAiAnalysisIndex();
  const articleIndex = db.getAllDfArticleIndexEntries();

  let waitingForSubtitles = 0;
  let waitingForArticle = 0;
  let anythingDownloaded = false;

  const items = entries.filter((entry) => {
    // Nothing downloaded means no transcript and no file, so there is nothing
    // a scheduled run could usefully do beyond tagging - which the tagging
    // feature already covers on its own terms.
    if (!DfContentEntryUtils.hasDownload(entry)) {
      return false;
    }
    anythingDownloaded = true;
    if (analysisIndex[entry.key]) {
      return false;
    }
    if (eligibility.requireSubtitles && !DfContentEntryUtils.hasSubtitles(entry)) {
      waitingForSubtitles++;
      return false;
    }
    if (eligibility.requireArticle && !articleIndex[entry.key]?.hasArticle) {
      /*
       * With no grace set, an article is *strictly* required and this item
       * waits indefinitely. That is a legitimate choice rather than an
       * oversight - the article is worth 11.6 points of classification
       * accuracy, and "only ever analyse things with an article" is not
       * expressible if the grace is permanently on.
       */
      if (eligibility.articleGrace === undefined) {
        waitingForArticle++;
        return false;
      }
      const publishedAt = entry.contentInfo.publishedDate?.getTime();
      // An entry with no publish date has no clock to measure the grace
      // against, so it can never age out of it - treated as still waiting
      // rather than analysed on a guess.
      if (publishedAt === undefined || Number.isNaN(publishedAt)) {
        waitingForArticle++;
        return false;
      }
      if (now.getTime() - publishedAt < eligibility.articleGrace) {
        waitingForArticle++;
        return false;
      }
    }
    return true;
  });

  items.sort((a, b) => (b.contentInfo.publishedDate?.getTime() ?? 0) - (a.contentInfo.publishedDate?.getTime() ?? 0));

  if (items.length) {
    return { items };
  }

  if (!anythingDownloaded) {
    return { items, emptyReason: "Nothing has been downloaded yet, so there is nothing to analyse" };
  }
  const waiting: string[] = [];
  if (waitingForSubtitles) {
    waiting.push(`${waitingForSubtitles} ${waitingForSubtitles === 1 ? "is" : "are"} waiting for subtitles`);
  }
  if (waitingForArticle) {
    waiting.push(
      `${waitingForArticle} ${waitingForArticle === 1 ? "is" : "are"} waiting for a Digital Foundry article`
    );
  }
  if (waiting.length) {
    return { items, emptyReason: `Everything else has been analysed - ${waiting.join(", and ")}` };
  }
  return { items, emptyReason: `Everything with ${describeConditions(eligibility)} has been analysed` };
};
