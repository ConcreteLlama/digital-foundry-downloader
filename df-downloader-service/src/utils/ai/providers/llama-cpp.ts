import { Agent } from "undici";
import { AiLocalProviderConfig } from "df-downloader-common/config/ai-analysis-config.js";
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

type ChatResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

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

  callStructured: async <T extends z.ZodType>(
    schema: T,
    system: string,
    content: string,
    instruction: string
  ) => {
    const startedAt = Date.now();
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
      const response: ChatResponse = await localComputeGate.withExclusive("Local analysis", () =>
        postJson(baseUrl, "/v1/chat/completions", {
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
        })
      );

      const choice = response.choices?.[0];
      const text = choice?.message?.content;
      if (!text) {
        // Distinguished explicitly because the two causes need different
        // fixes: a truncation wants a smaller input or a bigger cap, an empty
        // answer usually means thinking was not suppressed.
        const reason =
          choice?.finish_reason === "length"
            ? "ran out of output tokens - the input may be too long for the context size"
            : "returned nothing";
        throw new Error(`Local model ${config.model} ${reason}`);
      }

      const parsed = schema.parse(JSON.parse(stripJsonFence(text)));
      return {
        parsed,
        usage: {
          provider: "local",
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          // No costUsd at all rather than zero - this run cost time.
          durationMs: Date.now() - startedAt,
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
