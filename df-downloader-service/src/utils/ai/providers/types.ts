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
