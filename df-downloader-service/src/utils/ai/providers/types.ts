import { AiAnalysisUsage } from "df-downloader-common";
import { z } from "zod";

/**
 * One engine that can answer a structured analysis call.
 *
 * The seam is this narrow because almost nothing about analysing content is
 * provider-specific. `analyse.ts` decides what to send, in what order, and
 * what to do with the answer; a provider only has to turn a prompt plus a
 * schema into a validated object, and say what that cost.
 *
 * Everything genuinely engine-specific lives behind it: thinking and
 * reasoning parameters, prompt caching, refusal handling, pricing, and - for
 * a local engine - process lifecycle and grammar-constrained decoding.
 *
 * Deliberately built around a bound provider rather than free functions
 * taking a client and a config. A local provider has to own a server process
 * and a downloaded model, which is state a per-call function cannot hold.
 */
export type AiProviderId = "anthropic" | "local";

export type AiCallResult<T> = {
  parsed: T;
  usage: AiAnalysisUsage;
};

export type AiProvider = {
  readonly id: AiProviderId;
  /**
   * The model actually answering, for recording against the result. Not
   * always the configured one - a local provider may fall back.
   */
  readonly model: string;

  /**
   * The model's usable context window, when it has one worth checking.
   *
   * Undefined for a hosted model, whose window is large enough that nothing
   * this app sends comes close. Set for local models, where deciding whether
   * transcript position markers fit is a real question - they cost 18-38% more
   * prompt tokens.
   */
  readonly contextTokens?: number;

  /**
   * Whether this engine wants classification as a call of its own.
   *
   * A per-engine answer because it was measured as one. Asked to classify,
   * summarise and tag together, a local model wrote a 509-character summary
   * and no conclusion on a Q+A; with classification moved out, 1,484 and a
   * 681-character conclusion. Across six items the combined call left the
   * conclusion empty four times; the split call filled it on all but one
   * observation across three runs. A hosted model does both jobs at once
   * perfectly well and would only pay for the extra round trip.
   *
   * Note this costs latency rather than saving it: the split produces more
   * output, and output tokens dominate local generation time. The overview
   * stage roughly doubled (3.3s to 5.9s on that Q+A). The classify call
   * itself is nearly free - ~0.7s to emit about twenty tokens.
   *
   * The classify call goes without the transcript - across eight items and six
   * content types both engines classified identically with and without one, at
   * 75% fewer prompt tokens - so this costs a small call and buys a large
   * improvement.
   */
  readonly separatesClassification: boolean;

  /**
   * Whether the extraction call should carry `[Ns]` transcript markers.
   *
   * Per-engine because the measurement was. On a local model they take located
   * findings from 77% to 85% and halve invented quotes, for 18-38% more prompt
   * tokens. A hosted model already locates very nearly everything, so the same
   * tokens would buy nothing and cost money on every run.
   */
  readonly usesTranscriptMarkers: boolean;

  /**
   * Whether the extraction call should carry the quote-coverage clause.
   *
   * Per-engine, and within the local engine per-model, because that is how it
   * measured. The clause tells the model that whether an item is worth
   * reporting and whether it can be quoted are separate decisions. Only the
   * 9B needs it: it drops real findings rather than cite them awkwardly, and
   * the clause moves located findings from 84% to 86% and article-only
   * citations from 10% to 9%.
   *
   * Not a free win, and deliberately recorded as such: on the Halo settings
   * table - the standing coverage canary - it returned 9, 10, 8 against a
   * rock-solid 10, 10, 10 without it. It reduces the coverage damage the
   * other candidate wordings caused rather than eliminating it. Its clearest
   * win is the item every other configuration failed: Steam Controller went
   * from 3/18 located to 12/21.
   *
   * False on the hosted path and on the 35B, both of which post 0-1%
   * article-only citations and so have nothing to reclaim.
   */
  readonly usesQuoteCoverageClause: boolean;

  /** One structured-output call: prompt in, schema-validated object out. */
  callStructured<T extends z.ZodType>(
    schema: T,
    system: string,
    content: string,
    instruction: string,
    /**
     * Called as output arrives, where the engine can report it.
     *
     * A running count, never a fraction: the model decides when it stops, so
     * there is no denominator that is not invented. Local streams and reports;
     * the hosted path does not, and simply never calls this.
     */
    onProgress?: (progress: {
      outputTokens: number;
      /**
       * Blocked waiting for the machine rather than generating - see
       * LocalComputeGate. Reported so a caller can say so instead of showing
       * a stalled token count.
       */
      waiting?: boolean;
    }) => void
  ): Promise<AiCallResult<z.infer<T>>>;

  /**
   * Input size before committing to a run.
   *
   * Exact rather than estimated on both engines - Anthropic has a counting
   * endpoint and llama.cpp can tokenise locally - which is what lets the
   * pre-run figure be trusted.
   */
  countInputTokens(system: string, content: string, instruction: string): Promise<number>;

  /**
   * What a run of this size would cost in money, or undefined when the
   * question does not apply.
   *
   * Undefined rather than zero, deliberately: a local run is not free, it
   * costs time instead, and reporting zero would quietly average into the
   * spend figures as though it were a bargain.
   */
  estimateCostUsd(inputTokens: number, outputTokens: number): number | undefined;
};
