import { z } from "zod";

/**
 * Work that runs a model on this machine, and how much of it at once.
 *
 * Transcription and local AI analysis both claim most of the machine's cores,
 * so they cannot usefully run together - and until this existed they were in
 * separate queues with a lock between them that the scheduler could not see.
 * That lock is gone; they share one queue, and this is its limit. See
 * docs/LOCAL_MODELS_QUEUE_DESIGN.md.
 *
 * Named for models rather than for compute deliberately. The boundary is "runs
 * a model here" - Whisper and a local LLM are in, ffmpeg is not - which a
 * broader name would have blurred.
 */
/** Exported so the settings field can derive its bounds from the schema. */
export const MaxConcurrentLocalModels = z.number().int().min(1).max(8);

export const LocalModelsConfig = z.object({
  /**
   * Deliberately 1, and rarely worth raising.
   *
   * Each of these workloads already claims most of the cores (see
   * WhisperConfig.threads), so running two oversubscribes the CPU several times
   * over and makes both slower than running them in turn - along with anything
   * else on the same box. This is a "make everything crawl" dial far more often
   * than a throughput one.
   *
   * Replaces subtitles.maxConcurrent, which could not tell the truth: it was
   * overridden whenever an analysis wanted the machine, so setting it to 3 did
   * not give three.
   */
  maxConcurrent: MaxConcurrentLocalModels.default(1)
    .describe(
      "How many transcriptions or local analyses may run at once. One is almost always right - each already uses most of your processor, so running two makes both slower rather than finishing sooner."
    ),
});
export type LocalModelsConfig = z.infer<typeof LocalModelsConfig>;
export const LocalModelsConfigKey = "localModels";
