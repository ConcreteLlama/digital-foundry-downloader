import { AiAnalysisConfig, AiAnalysisConfigUtils, AiProviderId } from "df-downloader-common/config/ai-analysis-config.js";
import { AiAnalysisNotConfiguredError } from "../anthropic-client.js";
import { makeAnthropicProvider } from "./anthropic.js";
import { makeLocalProvider } from "./llama-cpp.js";
import { AiProvider } from "./types.js";

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
    // Guaranteed present: a local provider is only reported usable once it is
    // set, since the app does not yet manage a server of its own.
    return makeLocalProvider(config.local, config.local.serverUrl!);
  }
  return makeAnthropicProvider(config);
};
