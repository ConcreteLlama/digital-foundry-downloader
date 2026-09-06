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
  /^.*(?:(?:load_backend|whisper_backend_init_gpu|ggml_vulkan):|offload(?:ed|ing) .*(?:layers|layer) to GPU|no usable GPU found).*$/gm;

/** whisper.cpp's verdict. Absent entirely when it stays on the CPU. */
const WHISPER_USING_GPU = /whisper_backend_init_gpu: using (\S+) backend/;

/**
 * llama.cpp's offload count, where it is printed at all.
 *
 * Matched on the phrase alone rather than on the "load_tensors:" that
 * precedes it, because that prefix is llama.cpp's __func__ and has been
 * renamed across versions.
 *
 * NOT reliably present. The build shipped here (b10733) prints no loader
 * detail whatsoever at default verbosity - checked by capturing both streams
 * of a real server start to a file - so a verdict resting on this alone
 * reported CPU for every run regardless of the truth. Kept because builds
 * that do print it give the best answer available; the warning below is what
 * carries the common case.
 */
const LLAMA_OFFLOADED = /offloaded (\d+)\/(\d+) layers to GPU/;

/**
 * llama.cpp saying outright that it cannot use one.
 *
 * Printed before anything else when no GPU is usable - whether the build has
 * no GPU support or the machine has no card - and it is the only unambiguous
 * statement this build makes on the subject. Its ABSENCE is not proof of a
 * GPU on its own, which is why it is combined with what was asked for below.
 */
const LLAMA_NO_GPU = /no usable GPU found/;

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
  const device = output.match(VULKAN_DEVICE)?.[1];
  /*
   * Three sources, in order of how much they actually prove.
   *
   * whisper says which backend it chose, and llama says how many layers it
   * offloaded - both definitive, both absent in some builds. Failing those,
   * llama at least says when it could NOT use a GPU, so a run that asked for
   * one, was not told no, and had a device enumerated is on it. That last
   * step is inference rather than testimony, and is worded as such.
   */
  const toldNoGpu = LLAMA_NO_GPU.test(output);
  /*
   * Not being offered a GPU is decisive on its own.
   *
   * Whether one was asked for is something this app knows for certain - it
   * passes -ngl itself - so a run that did not ask for one is on the CPU
   * whatever the server does or does not print. Only the other direction
   * needs evidence.
   */
  if (!gpuRequested) {
    return "CPU - GPU turned off in settings";
  }
  const onGpu = Boolean(whisperGpu) || Number(offloaded?.[1] ?? 0) > 0 || !toldNoGpu;
  if (!onGpu) {
    return "CPU - no usable GPU found";
  }
  /*
   * A name only if one was printed. Requiring one used to sink the whole
   * verdict: this llama build prints no device line, so a real GPU run fell
   * through to "said nothing about which backend it chose" - the one outcome
   * this line exists to prevent. An unnamed GPU is still an answer.
   */
  const named = device ?? whisperGpu?.[1];
  if (offloaded) {
    return `GPU - ${named ?? "device"} (${offloaded[1]}/${offloaded[2]} layers offloaded)`;
  }
  if (whisperGpu) {
    return `GPU - ${named}`;
  }
  return named
    ? `GPU - ${named} (assumed: it was asked for and not refused)`
    : "GPU (assumed: it was asked for, and the model server did not say it was unusable)";
};
