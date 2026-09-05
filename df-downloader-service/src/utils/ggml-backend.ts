/**
 * Working out - and saying plainly - whether whisper.cpp or llama.cpp ended up
 * on a GPU.
 *
 * Worth its own file because the obvious lines are the misleading ones.
 * "ggml_vulkan: Found 1 Vulkan devices" and "load_backend: loaded Vulkan
 * backend from ..." come from ggml's backend registry, which dlopens every
 * backend it can find at startup, long before anything decides what to run
 * on. Both appear verbatim on a run that then does all its work on the CPU,
 * so a log built out of them claims a GPU run that never happened.
 */

/**
 * Lines worth keeping from the startup chatter, for the detail log.
 *
 * Deliberately not anchored to the start of the line. whisper-cli prints
 * these bare, but llama-server runs them through its own formatter first, so
 * they arrive as "0.05.422.179 I llm  load_tensors: offloaded ...". Matching
 * from the line start finds the first and silently misses the second.
 */
export const BACKEND_LINE =
  /^.*(?:(?:load_backend|whisper_backend_init_gpu|ggml_vulkan):|offload(?:ed|ing) .*(?:layers|layer) to GPU).*$/gm;

/** whisper.cpp's verdict. Absent entirely when it stays on the CPU. */
const WHISPER_USING_GPU = /whisper_backend_init_gpu: using (\S+) backend/;

/**
 * llama.cpp's verdict. Always printed, so the count is what matters: -ngl 0
 * still reports "offloaded 0/29 layers to GPU".
 *
 * Matched on the phrase alone rather than on the "load_tensors:" that
 * precedes it, because that prefix is llama.cpp's __func__ and has been
 * renamed across versions.
 */
const LLAMA_OFFLOADED = /offloaded (\d+)\/(\d+) layers to GPU/;

/** The device's real name, rather than the "Vulkan0" slot it occupies. */
const VULKAN_DEVICE = /ggml_vulkan: \d+ = ([^|]+?)\s*\|/;

/**
 * A phrase to drop into "X is running on the ...".
 *
 * `gpuRequested` separates the two CPU outcomes, which the tools themselves
 * do not: both whisper.cpp given -ng and a machine with no card at all print
 * "no GPU found", and only the caller knows which of those it asked for.
 */
export const describeComputeBackend = (output: string, gpuRequested: boolean): string => {
  const whisperGpu = output.match(WHISPER_USING_GPU);
  const offloaded = output.match(LLAMA_OFFLOADED);
  const onGpu = Boolean(whisperGpu) || Number(offloaded?.[1] ?? 0) > 0;
  if (!onGpu) {
    return gpuRequested ? "CPU - no usable GPU found" : "CPU - GPU turned off in settings";
  }
  const device = output.match(VULKAN_DEVICE)?.[1] ?? whisperGpu?.[1] ?? "GPU";
  return offloaded ? `GPU - ${device} (${offloaded[1]}/${offloaded[2]} layers offloaded)` : `GPU - ${device}`;
};
