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

/**
 * One thing the self-test looked at, and what it found.
 *
 * A list rather than a single verdict because the failures worth catching are
 * not all the same kind. A server that will not start and a server that
 * answers instantly with nonsense both mean "local analysis is not working",
 * but only one of them is fixed by looking at the log.
 */
export const AiSelfTestCheck = z.object({
  name: z.string(),
  /**
   * `info` carries a measurement with no pass mark - which device it ran on,
   * how fast it was. Those are the numbers someone tuning settings wants, and
   * neither has a value that is correct in the abstract.
   */
  state: z.enum(["pass", "warn", "fail", "info"]),
  detail: z.string(),
});
export type AiSelfTestCheck = z.infer<typeof AiSelfTestCheck>;

export const AiSelfTestRequest = z.object({
  /** As with the provider test: what is on screen, not what was last saved. */
  config: AiAnalysisConfig,
});
export type AiSelfTestRequest = z.infer<typeof AiSelfTestRequest>;

export const AiSelfTestResponse = z.object({
  ok: z.boolean(),
  summary: z.string(),
  checks: z.array(AiSelfTestCheck),
  /**
   * What the model actually wrote.
   *
   * Returned on purpose, including on a pass. The failure this test exists
   * for produces a well-formed answer that is simply wrong, and no amount of
   * summarising substitutes for reading the sentence it came back with.
   */
  output: z.string().optional(),
});
export type AiSelfTestResponse = z.infer<typeof AiSelfTestResponse>;
