import { Agent } from "undici";
import { AiLocalModels, AiLocalProviderConfig } from "df-downloader-common/config/ai-analysis-config.js";
import { z } from "zod";
import { stripJsonFence } from "../anthropic-client.js";
import { LocalLlamaServer } from "../local-server.js";
import { localComputeGate } from "../../local-compute-gate.js";
import { AiProvider } from "./types.js";

/**
 * Analysis on this machine, via llama.cpp's server.
 *
 * Talks to llama-server's OpenAI-compatible endpoint rather than driving a
 * binary per call, because a call has to be able to reuse an already-loaded
 * model - loading is seconds, and doing it per request would dominate.
 *
 * ## Structured output
 *
 * llama-server compiles a JSON Schema to a GBNF grammar and constrains
 * decoding to it, which makes malformed JSON essentially impossible: in
 * testing every failure was a truncation against the token cap, never a
 * grammar violation. That is a stronger guarantee than the hosted path, which
 * asks for a shape and validates afterwards.
 *
 * It also means the two-call split is not forced here the way it is on
 * Anthropic, where a combined schema exceeded a hard union-parameter limit.
 * The split is kept anyway because it is the better shape - a Q+A has no
 * settings table - but for that reason rather than by inheritance.
 */

const MAX_OUTPUT_TOKENS = 16000;

/**
 * Thinking is suppressed explicitly, and this is not optional.
 *
 * Every reasoning-capable model tested spent its entire output budget on
 * hidden reasoning and returned nothing usable. Qwen routes it to a separate
 * `reasoning_content` field, leaving `content` empty; the symptom is an empty
 * response with `finish_reason: "length"`, which looks exactly like a model
 * that cannot do structured output. It is not - it is a model that was never
 * told to answer. Removing this will silently break every analysis.
 */
const NO_THINKING = { enable_thinking: false };

/**
 * No timeout, because a local generation legitimately takes minutes.
 *
 * Node's fetch gives up after 300 seconds waiting for response headers, and a
 * non-streaming llama-server sends none until the whole answer is generated -
 * so a slow machine working correctly gets its request killed mid-thought and
 * reports the useless "fetch failed". Measured: it throws at 302s with
 * UND_ERR_HEADERS_TIMEOUT, which is exactly what was seen in the wild on a
 * six-thread microserver.
 *
 * Scoped to this dispatcher rather than set globally: everything else this app
 * talks to - Digital Foundry, YouTube, Anthropic - should keep a sane ceiling,
 * and only the local model has a good reason to take this long.
 */
const localDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

/**
 * Turns a fetch failure into something actionable.
 *
 * Node reports every transport problem as a bare "fetch failed" and hides the
 * real reason on `cause`, which is useless in a task's error field - a model
 * that took too long, a server that is not running and a server that died
 * mid-answer all read identically. The elapsed time is included because the
 * most likely cause here is a slow generation, and a number close to Node's
 * own 300-second default is the tell.
 */
const describeLocalFailure = (e: any, url: string, elapsedMs: number): string => {
  const code = e?.cause?.code ?? e?.code;
  const seconds = Math.round(elapsedMs / 1000);
  switch (code) {
    case "UND_ERR_HEADERS_TIMEOUT":
    case "UND_ERR_BODY_TIMEOUT":
      return `The local model did not answer within ${seconds}s and the request timed out. A slow machine generating a long answer can exceed this - the model is working, but nothing is waiting for it any more.`;
    case "ECONNREFUSED":
      return `Nothing is listening at ${url} after ${seconds}s - the model server is not running.`;
    case "ECONNRESET":
      return `The connection to ${url} was reset after ${seconds}s, which usually means the model server died mid-answer - check whether it ran out of memory.`;
    case "UND_ERR_SOCKET":
      return `The connection to ${url} closed unexpectedly after ${seconds}s, which usually means the model server exited.`;
    default:
      break;
  }
  const detail = e?.cause?.message ?? e?.message ?? String(e);
  return `Local model request to ${url} failed after ${seconds}s: ${detail}${code ? ` (${code})` : ""}`;
};

const postJson = async (baseUrl: string, path: string, body: unknown): Promise<any> => {
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Not in the DOM RequestInit types, but Node's fetch honours it - the
      // probe above was run against this exact mechanism.
      dispatcher: localDispatcher,
    } as RequestInit);
  } catch (e: any) {
    throw new Error(describeLocalFailure(e, `${baseUrl}${path}`, Date.now() - startedAt));
  }
  if (!response.ok) {
    throw new Error(`llama-server ${path} returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
};

/** What a streamed completion yields once it has finished arriving. */
type StreamedCompletion = {
  text: string;
  finishReason?: string;
  /**
   * llama-server's own timings, carried on the final chunk.
   *
   * Streaming loses nothing: prompt and generation counts and rates all still
   * arrive, so the usage figures keep working and the throughput estimate has
   * a real rate to learn from.
   */
  timings?: {
    prompt_n?: number;
    predicted_n?: number;
    predicted_per_second?: number;
    cache_n?: number;
  };
};

/**
 * Streams a completion, reporting generated tokens as they arrive.
 *
 * Streaming rather than waiting for the whole answer because generation is
 * where the time goes - measured at 88% of wall clock against 11% for prompt
 * processing, which the server's prompt cache frequently skips outright. So
 * generation is the only phase worth reporting.
 *
 * Grammar-constrained output survives it: measured at one chunk per generated
 * token, with the assembled result parsing cleanly against the wire schema, so
 * `response_format` is unchanged.
 *
 * The count is chunks, which is tokens here. Reported as a running number and
 * never as a percentage - the model decides when it stops, so there is no
 * honest denominator to divide by.
 */
const postStream = async (
  baseUrl: string,
  path: string,
  body: unknown,
  onTokens?: (generated: number) => void
): Promise<StreamedCompletion> => {
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      dispatcher: localDispatcher,
    } as RequestInit);
  } catch (e: any) {
    throw new Error(describeLocalFailure(e, `${baseUrl}${path}`, Date.now() - startedAt));
  }
  if (!response.ok) {
    throw new Error(`llama-server ${path} returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  if (!response.body) {
    throw new Error("llama-server returned no body for a streamed request");
  }

  const decoder = new TextDecoder();
  let buffered = "";
  let text = "";
  let generated = 0;
  let finishReason: string | undefined;
  let timings: StreamedCompletion["timings"];

  for await (const chunk of response.body as any) {
    buffered += decoder.decode(chunk, { stream: true });
    // Server-sent events are newline delimited, and a read can end mid-line -
    // the trailing fragment is kept for the next one rather than parsed.
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }
      let event: any;
      try {
        event = JSON.parse(payload);
      } catch {
        // One malformed line is not worth failing a whole generation over.
        continue;
      }
      const delta = event?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length) {
        text += delta;
        generated++;
        onTokens?.(generated);
      }
      finishReason = event?.choices?.[0]?.finish_reason ?? finishReason;
      // Carried on the final chunk only, so the last one seen is the real one.
      timings = event?.timings ?? timings;
    }
  }

  return { text, finishReason, timings };
};

/**
 * Acquires the server per call rather than at construction, so the model is
 * loaded only while there is work and released the moment there is not - see
 * LocalLlamaServer. Construction stays synchronous, which keeps provider
 * resolution simple everywhere else.
 */
export const makeLocalProvider = (config: AiLocalProviderConfig, server: LocalLlamaServer): AiProvider => ({
  id: "local",
  model: config.model,
  contextTokens: config.contextSize,
  // Measured: classifying in the same call costs it most of the summary.
  separatesClassification: true,
  // Measured: 77% -> 85% located, invention 6% -> 3%.
  usesTranscriptMarkers: true,
  /*
   * Follows the selected model, not the engine - see AiLocalModelInfo. Where
   * serverUrl points at a model the user runs themselves, the configured
   * choice is still the best signal available for what is answering.
   */
  usesQuoteCoverageClause: AiLocalModels[config.model].needsQuoteCoverageClause,

  callStructured: async <T extends z.ZodType>(
    schema: T,
    system: string,
    content: string,
    instruction: string,
    onProgress?: (progress: { outputTokens: number; waiting?: boolean }) => void
  ) => {
    const baseUrl = await server.acquire();
    try {
      /*
       * `io: "output"` matters: the wire schemas are required-and-nullable by
       * design, and the output view is what preserves that. Every one of them
       * converts cleanly - no $ref, no anyOf - which is what makes the grammar
       * compiler able to take them directly.
       */
      const jsonSchema = z.toJSONSchema(schema as any, { io: "output" });
      /*
       * Exclusive: this saturates the machine, and so does transcription. The
       * gate is around the call rather than the whole provider because the
       * work happens in the server process while this request is open.
       */
      /*
       * Timed inside the gate, not outside it.
       *
       * durationMs feeds observedLocalTokensPerMs, which divides tokens by it
       * to learn how fast this machine is - so anything in the window that is
       * not inference makes the machine look slower than it is, permanently
       * and cumulatively. Waiting for a transcription to finish can be many
       * minutes and is not work this run did, and neither is loading the
       * model, which is not proportional to tokens either way.
       */
      let inferenceMs = 0;
      const streamed = await localComputeGate.withExclusive(
        "Local analysis",
        async () => {
        const inferenceStartedAt = Date.now();
        try {
          return await postStream(
            baseUrl,
            "/v1/chat/completions",
            {
              messages: [
                { role: "system", content: system },
                // One user message rather than the hosted path's two blocks: those
                // exist to mark a cacheable prefix, and there is no per-token
                // billing here for a cache to save.
                { role: "user", content: `${content}\n\n${instruction}` },
              ],
              max_tokens: MAX_OUTPUT_TOKENS,
              temperature: 0,
              response_format: {
                type: "json_schema",
                json_schema: { name: "analysis", schema: jsonSchema, strict: true },
              },
              chat_template_kwargs: NO_THINKING,
              // Generation is 88% of the wait and the only phase worth
              // reporting; the grammar constraint survives streaming intact.
              stream: true,
            },
            onProgress ? (outputTokens) => onProgress({ outputTokens }) : undefined
          );
        } finally {
          inferenceMs = Date.now() - inferenceStartedAt;
        }
        },
        (waiting) => onProgress?.({ outputTokens: 0, waiting })
      );

      const text = streamed.text;
      if (!text) {
        // Distinguished explicitly because the two causes need different
        // fixes: a truncation wants a smaller input or a bigger cap, an empty
        // answer usually means thinking was not suppressed.
        const reason =
          streamed.finishReason === "length"
            ? "ran out of output tokens - the input may be too long for the context size"
            : "returned nothing";
        throw new Error(`Local model ${config.model} ${reason}`);
      }

      const parsed = schema.parse(JSON.parse(stripJsonFence(text)));
      return {
        parsed,
        usage: {
          provider: "local",
          // From the final chunk's timings, which streaming still carries.
          inputTokens: streamed.timings?.prompt_n ?? 0,
          outputTokens: streamed.timings?.predicted_n ?? 0,
          // No costUsd at all rather than zero - this run cost time.
          // Inference only - excludes the gate wait and model load, which are
          // not work this run did and would skew the learned rate.
          durationMs: inferenceMs,
        },
      };
    } finally {
      server.release();
    }
  },

  countInputTokens: async (system: string, content: string, instruction: string) => {
    // Exact rather than estimated, and free - so the pre-run figure is as
    // trustworthy as the hosted one, it just buys a duration instead of a
    // price.
    const baseUrl = await server.acquire();
    try {
      const result = await postJson(baseUrl, "/tokenize", {
        content: `${system}\n\n${content}\n\n${instruction}`,
      });
      return Array.isArray(result?.tokens) ? result.tokens.length : 0;
    } finally {
      server.release();
    }
  },

  // Money is the wrong question here; the caller reports time instead.
  estimateCostUsd: () => undefined,
});
