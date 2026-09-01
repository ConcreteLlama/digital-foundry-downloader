import { AiCostLogEntry, AiAnalysisResult, logger } from "df-downloader-common";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { ensureDirectory } from "../utils/file-utils.js";
import { writeFileAtomic } from "../utils/file-utils.js";
import { zodParse } from "df-downloader-common";

const FILE_NAME = "ai-cost-log.json";
const CURRENT_VERSION = "1";

const AiCostLogFile = z.object({
  version: z.string(),
  /** When this log started, so a total can say what it does and does not cover. */
  startedAt: z.coerce.date(),
  entries: z.array(AiCostLogEntry),
});
type AiCostLogFile = z.infer<typeof AiCostLogFile>;

/**
 * What every analysis run cost, kept rather than replaced.
 *
 * The analyses themselves are one blob per item, so re-analysing overwrites a
 * result and takes its cost with it - which makes the stored analyses a fine
 * answer to "what did what I have cost to produce" and no answer at all to
 * "what have I spent". This is the second question, and it needs its own
 * record because nothing else keeps one.
 *
 * Append-only and never rewritten except to add. Entries are deduplicated on
 * content and run timestamp, because saving an analysis is not the same as
 * running one: the analysis task returns the stored result when an item was
 * analysed while it waited in the queue, and that goes through the same save
 * path a real run does.
 *
 * Written straight through rather than on a debounce. Analyses finish minutes
 * apart at worst, and a cost that never reached disk cannot be recovered from
 * anywhere - unlike the caches here, which can always be refetched.
 */
export class AiCostLog {
  private constructor(
    private readonly filePath: string,
    private log: AiCostLogFile
  ) {}

  static async create(dbDir: string): Promise<AiCostLog> {
    ensureDirectory(dbDir);
    const filePath = path.join(dbDir, FILE_NAME);
    let log: AiCostLogFile = { version: CURRENT_VERSION, startedAt: new Date(), entries: [] };
    try {
      log = zodParse(AiCostLogFile, JSON.parse(await fs.promises.readFile(filePath, { encoding: "utf-8" })));
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        // Starting fresh loses history, which is the one thing this exists to
        // keep - so unlike the caches, say so loudly rather than in passing.
        logger.log("warn", `AI cost log unreadable, starting a new one: ${e}`);
      }
    }
    return new AiCostLog(filePath, log);
  }

  /** Every run recorded, oldest first. */
  list(): AiCostLogEntry[] {
    return this.log.entries;
  }

  startedAt(): Date {
    return this.log.startedAt;
  }

  /**
   * Two populations, never summed together.
   *
   * A run that cost time is not a cheap run - averaging it into the money
   * figures would make both numbers meaningless.
   */
  total(): { costUsd: number; runCount: number; localRunCount: number; localDurationMs: number } {
    let costUsd = 0;
    let runCount = 0;
    let localRunCount = 0;
    let localDurationMs = 0;
    for (const entry of this.log.entries) {
      if (entry.costUsd === undefined) {
        localRunCount++;
        localDurationMs += entry.durationMs ?? 0;
      } else {
        costUsd += entry.costUsd;
        runCount++;
      }
    }
    return { costUsd, runCount, localRunCount, localDurationMs };
  }

  /**
   * Record a run, unless this exact one is already here.
   *
   * Keyed on content and the run's own timestamp rather than on arrival: the
   * same result can be saved more than once, and a ledger that counts a save
   * rather than a run would drift above the real bill.
   */
  async record(contentKey: string, result: AiAnalysisResult, title?: string): Promise<boolean> {
    if (!result.usage || result.error) {
      return false;
    }
    const analysedAt = new Date(result.analysedAt);
    const already = this.log.entries.some(
      (entry) => entry.contentKey === contentKey && entry.analysedAt.getTime() === analysedAt.getTime()
    );
    if (already) {
      return false;
    }
    this.log.entries.push({
      contentKey,
      title,
      model: result.model,
      analysedAt,
      costUsd: result.usage.costUsd,
      durationMs: result.usage.durationMs,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
    try {
      // Compact, like the other stores: this one only grows - a row per
      // analysis run, kept forever - so the indentation compounds.
      await writeFileAtomic(this.filePath, JSON.stringify(this.log));
    } catch (e) {
      logger.log("error", `Could not write the AI cost log: ${e}`);
    }
    return true;
  }
}
