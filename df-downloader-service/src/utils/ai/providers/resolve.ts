import {
  AiAnalysisConfig,
  AiAnalysisConfigUtils,
  AiProviderId,
} from "df-downloader-common/config/ai-analysis-config.js";
import { AiAnalysisNotConfiguredError } from "../anthropic-client.js";
import { LocalLlamaServer } from "../local-server.js";
import { makeAnthropicProvider } from "./anthropic.js";
import { makeLocalProvider } from "./llama-cpp.js";
import { AiProvider } from "./types.js";

/**
 * One server for the process, not one per run.
 *
 * The model is gigabytes and takes seconds to load, so it has to outlive a
 * single analysis - a backfill that reloaded it per item would spend most of
 * its time loading. Created lazily so an install that never analyses locally
 * never constructs one.
 */
let localServer: LocalLlamaServer | undefined;

const getLocalServer = (config: AiAnalysisConfig): LocalLlamaServer => {
  if (!localServer) {
    localServer = new LocalLlamaServer(config.local);
  } else {
    // Config can change under a running server - a different idle timeout or
    // thread count applies next time it starts, without disturbing this one.
    localServer.update(config.local);
  }
  return localServer;
};

/** Stops any managed server, for shutdown. */
export const stopLocalAnalysisServer = async () => {
  await localServer?.stop();
};

/**
 * The engine a run should use.
 *
 * `requested` is honoured when it can be - a per-run choice - and otherwise
 * falls back to the configured default and then to whatever is usable. That
 * fallback matters most for unattended work: an automatic analysis should not
 * be abandoned because the preferred engine is unavailable when another one is
 * sitting right there.
 *
 * Throws when nothing can answer, with the reason for the engine that was
 * actually asked for, since "no API key" is a more useful thing to be told
 * than "no provider available".
 */
export const makeProvider = (config: AiAnalysisConfig, requested?: AiProviderId): AiProvider => {
  const resolved = AiAnalysisConfigUtils.resolveProvider(config, requested);
  if (!resolved) {
    const reason =
      AiAnalysisConfigUtils.providerUnusableReason(config, requested ?? config.defaultProvider) ??
      "No AI provider is configured";
    throw new AiAnalysisNotConfiguredError(reason);
  }
  if (resolved === "local") {
    return makeLocalProvider(config.local, getLocalServer(config));
  }
  return makeAnthropicProvider(config);
};
