import { z } from "zod";
import { AiAnalysisConfig } from "../config/ai-analysis-config.js";

/**
 * Checks an AI provider's credentials against settings not yet saved.
 *
 * Carries the whole config for the same reason the media server test does:
 * the point is to check what is on screen before committing to it.
 */
export const TestAiProviderRequest = z.object({
  provider: z.enum(["anthropic", "local"]),
  config: AiAnalysisConfig,
});
export type TestAiProviderRequest = z.infer<typeof TestAiProviderRequest>;

export const TestAiProviderResponse = z.object({
  ok: z.boolean(),
  detail: z.string().optional(),
  error: z.string().optional(),
});
export type TestAiProviderResponse = z.infer<typeof TestAiProviderResponse>;
