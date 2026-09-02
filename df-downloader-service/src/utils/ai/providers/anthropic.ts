import { AiAnalysisConfig } from "df-downloader-common/config/ai-analysis-config.js";
import { z } from "zod";
import {
  calculateCostUsd,
  callStructured,
  countInputTokens,
  makeAnthropicClient,
} from "../anthropic-client.js";
import { AiProvider } from "./types.js";

/**
 * The hosted provider, wrapping the existing client.
 *
 * A thin binding rather than a rewrite: anthropic-client.ts already holds
 * everything provider-specific, so this only closes over the client and
 * config the free functions there used to be handed at every call.
 *
 * Throws AiAnalysisNotConfiguredError when there is no API key, which is
 * what callers already expect from constructing a client.
 */
export const makeAnthropicProvider = (config: AiAnalysisConfig): AiProvider => {
  const client = makeAnthropicClient(config);
  return {
    id: "anthropic",
    model: config.model,
    // Handles all three jobs in one call; splitting would only add a round trip.
    separatesClassification: false,
    // Already locates nearly every quote; markers would be paid for and unused.
    usesTranscriptMarkers: false,
    callStructured: <T extends z.ZodType>(schema: T, system: string, content: string, instruction: string) =>
      callStructured(client, config, schema, system, content, instruction),
    countInputTokens: (system: string, content: string, instruction: string) =>
      countInputTokens(client, config, system, content, instruction),
    estimateCostUsd: (inputTokens: number, outputTokens: number) =>
      calculateCostUsd(config.model, inputTokens, outputTokens),
  };
};
