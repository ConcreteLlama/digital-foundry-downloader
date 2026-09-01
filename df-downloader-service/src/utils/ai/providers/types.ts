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

  /** One structured-output call: prompt in, schema-validated object out. */
  callStructured<T extends z.ZodType>(
    schema: T,
    system: string,
    content: string,
    instruction: string
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
