import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiAnalysisUsage, logger } from "df-downloader-common";
import {
  AiAnalysisConfig,
  AiAnalysisConfigUtils,
  AiAnalysisModel,
  AiAnalysisModelCapabilities,
} from "df-downloader-common/config/ai-analysis-config.js";
import { z } from "zod";

/**
 * Non-streaming output ceiling.
 *
 * Comfortably above what any of these calls actually produce (the largest
 * measured response - a full settings table plus summary - was well under
 * 4k), while staying small enough that a non-streaming request cannot run
 * into the SDK's HTTP timeout. Worth being generous rather than tight:
 * hitting the cap truncates mid-JSON, which fails parsing rather than
 * degrading gracefully.
 */
const MAX_OUTPUT_TOKENS = 16000;

export class AiAnalysisNotConfiguredError extends Error {
  constructor(message = "AI analysis is not configured - set an API key in Settings > AI Analysis") {
    super(message);
    this.name = "AiAnalysisNotConfiguredError";
  }
}

export const makeAnthropicClient = (config: AiAnalysisConfig) => {
  if (!AiAnalysisConfigUtils.isUsable(config)) {
    throw new AiAnalysisNotConfiguredError();
  }
  return new Anthropic({ apiKey: config.apiKey!.trim() });
};

/**
 * Cost of a call in USD, from real token counts and the model's published
 * per-million rates.
 *
 * Thinking tokens bill as output tokens and are already included in
 * `outputTokens` by the API, so no separate handling is needed here - but
 * it is the reason a thinking-enabled model can cost several times what
 * the visible response length suggests.
 */
export const calculateCostUsd = (model: AiAnalysisModel, inputTokens: number, outputTokens: number): number => {
  const { pricing } = AiAnalysisModelCapabilities[model];
  return (inputTokens / 1_000_000) * pricing.inputPerMTok + (outputTokens / 1_000_000) * pricing.outputPerMTok;
};

/**
 * Builds the model-specific half of a request.
 *
 * Every branch here is a hard API constraint rather than a preference -
 * sending `effort` to Haiku, or `thinking: {type:"disabled"}` to Fable, is
 * a 400 rather than a silently ignored field. Centralised so the rules
 * live in exactly one place: the alternative is every call site growing
 * its own slightly different set of conditionals, which is precisely how a
 * model switch turns into a runtime failure.
 */
const buildModelParams = (config: AiAnalysisConfig) => {
  const capabilities = AiAnalysisModelCapabilities[config.model];
  const params: Record<string, unknown> = {};
  const effort = AiAnalysisConfigUtils.resolveEffort(config);

  if (capabilities.supportsThinking) {
    // Adaptive is the only on-mode on the current models; budget_tokens was
    // removed and is rejected outright.
    params.thinking = { type: "adaptive" };
  }
  if (capabilities.supportsEffort && effort) {
    params.output_config = { effort };
  }
  return params;
};

/**
 * Strips a Markdown code fence from a JSON payload.
 *
 * Structured-output mode makes this unnecessary in the normal case - the
 * response comes back as bare JSON. It is kept as defence in depth because
 * a fenced response was actually observed during this feature's
 * investigation when the same prompt was run without structured output,
 * and the failure mode if it recurs (a parse error on output that is
 * otherwise perfectly good) is both silent and expensive - the call has
 * already been paid for by then.
 */
export const stripJsonFence = (text: string): string => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return (fenced ? fenced[1] : trimmed).trim();
};

export type AiCallResult<T> = {
  parsed: T;
  usage: AiAnalysisUsage;
};

/**
 * Turns the API's token counts into a cost.
 *
 * Cached input is billed differently from fresh input - roughly a tenth to
 * read, roughly a quarter more to write - so the three kinds are priced
 * separately rather than lumped together. Getting this wrong would not
 * break anything, but it would quietly misreport what the feature costs,
 * which is the one number this whole estimate exists to provide.
 *
 * `inputTokens` on the stored result is the total of all three, so a
 * displayed figure still reflects everything that was sent.
 */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

const summariseUsage = (config: AiAnalysisConfig, usage: any): AiAnalysisUsage => {
  const freshInput = usage?.input_tokens ?? 0;
  const cacheRead = usage?.cache_read_input_tokens ?? 0;
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const { pricing } = AiAnalysisModelCapabilities[config.model];

  const inputCost =
    ((freshInput + cacheRead * CACHE_READ_MULTIPLIER + cacheWrite * CACHE_WRITE_MULTIPLIER) / 1_000_000) *
    pricing.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;

  return {
    inputTokens: freshInput + cacheRead + cacheWrite,
    outputTokens,
    costUsd: inputCost + outputCost,
  };
};

/**
 * One structured-output call: prompt in, schema-validated object out.
 *
 * Uses `messages.parse()` with the schema compiled to strict JSON Schema,
 * so the model is constrained to the shape rather than merely asked for
 * it. Falls back to parsing the raw text when `parsed_output` is absent -
 * which is where the fence stripping earns its place.
 */
export const callStructured = async <T extends z.ZodType>(
  client: Anthropic,
  config: AiAnalysisConfig,
  schema: T,
  system: string,
  content: string,
  instruction: string
): Promise<AiCallResult<z.infer<T>>> => {
  // Two blocks, not one concatenated string: the content is identical
  // across both calls of a run and the instruction is not, so marking the
  // content block cacheable lets the second call read a large transcript
  // back from cache instead of paying for it again. Caching is a prefix
  // match, which is why the varying instruction has to come second.
  const response = await client.messages.parse({
    model: config.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: content, cache_control: { type: "ephemeral" } },
          { type: "text", text: instruction },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(schema) },
    ...buildModelParams(config),
  } as any);

  const usage = summariseUsage(config, response.usage);

  // A refusal is an HTTP 200 with no usable content, so it has to be
  // checked explicitly rather than caught - reading content first would
  // throw something far less informative than the actual reason.
  if (response.stop_reason === "refusal") {
    throw new Error(
      `The model declined to analyse this content${
        (response as any).stop_details?.explanation ? `: ${(response as any).stop_details.explanation}` : ""
      }`
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The model's response was cut off before it finished - the transcript may be too long");
  }

  const parsedOutput = (response as any).parsed_output;
  if (parsedOutput) {
    return { parsed: parsedOutput as z.infer<T>, usage };
  }

  const textBlock = response.content.find((block: any) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("The model returned no text to parse");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonFence(textBlock.text));
  } catch (e) {
    logger.log("error", `AI analysis returned unparseable JSON: ${textBlock.text.slice(0, 500)}`);
    throw new Error(`The model's response could not be read as JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { parsed: schema.parse(raw) as z.infer<T>, usage };
};

/**
 * Exact input-token count for a prepared prompt, used for the pre-run cost
 * estimate.
 *
 * Counted by the API rather than approximated locally: the point of
 * showing an estimate is that it is trustworthy enough to decide on, and a
 * characters/4 guess is wrong by enough on transcript-sized inputs to
 * misinform that decision. Output tokens genuinely cannot be known ahead
 * of time and are projected separately.
 */
export const countInputTokens = async (
  client: Anthropic,
  config: AiAnalysisConfig,
  system: string,
  content: string,
  instruction: string
): Promise<number> => {
  const result = await client.messages.countTokens({
    model: config.model,
    system,
    messages: [{ role: "user", content: `${content}\n\n${instruction}` }],
  });
  return result.input_tokens;
};
