# GPU acceleration findings

What happened when subtitles and local AI analysis were given a graphics card, what
broke, and what was ruled out on the way. Written on 2026-09-06 after a day of
chasing it, because almost none of this is recoverable from the code.

**Read the caveats section before trusting any of it.** The conclusions are empirical,
measured on one machine, and several of them are the kind that quietly stop being true.

## The short version

- **Local AI analysis must not use the GPU on an Intel integrated graphics chip.** It
  returns confident, well-formed, meaningless results rather than failing. `useGpu`
  defaults to false for analysis, and on this hardware it must stay there.
- **Whisper is unaffected** and can keep the GPU. It never takes the code path that
  breaks.
- **The fault is in Intel's graphics driver**, not in llama.cpp, not in Vulkan as such,
  and not in the hardware. The identical build and model are correct on an NVIDIA card
  over Vulkan.
- **It is prompt-size dependent**, and the threshold is small enough that no real
  transcript is under it.
- **Updating Mesa helped and did not fix it.** The image now ships a current driver
  anyway, for reasons of its own.

## How GPU support is built

One image covers NVIDIA, AMD and Intel by using Vulkan rather than a vendor toolkit.
whisper.cpp and llama.cpp are both built with `GGML_BACKEND_DL` and
`GGML_CPU_ALL_VARIANTS`, so backends are dlopened at runtime and a machine with no
usable card falls back to the processor without anything failing.

That flexibility is also the trap: ggml's backend registry enumerates and loads every
backend it can find at startup, long before anything decides what to run on. So
`ggml_vulkan: Found 1 Vulkan devices` and `load_backend: loaded Vulkan backend` both
appear verbatim on a run that then does all its work on the CPU. `utils/ggml-backend.ts`
exists because of this — the honest signals are `offloaded N/M layers to GPU`, a
`Vulkan0 model buffer size`, and whisper's own `using X backend`, not the enumeration
lines.

A related trap, measured: `-ngl 0` does not stop the GPU being *registered*, and ggml
will schedule work onto it anyway. Turning the GPU off for analysis therefore passes
`-dev none`, not merely zero layers. Symptom when this was missing: CPU analysis ran at
roughly one output token per ten seconds, and unmapping `/dev/dri` "fixed" it.

## The corruption

On an Intel Core i3-N305 (Alder Lake-N integrated graphics), local analysis on the GPU
produced output that is structurally perfect and semantically worthless. Real examples:

```
{"contentType":"interview","contentTypeConfidence":1}
{"contentType":"tech_explainer","contentTypeConfidence":0.0000000000000000,
 "summary":" ( ( ( ( ( ( ( ( ( ( ( ( ..."}
{"contentType":"interview","contentTypeConfidence":-1111111111111111E-1111111111111111,
 "summary":""}
```

Every video classified the same, summaries empty or a single repeated token, and
confidence values no decoder could legitimately produce.

**Why it went unnoticed for a night.** llama.cpp compiles the JSON schema to a GBNF
grammar and constrains decoding to it, so output is always valid against the schema no
matter how meaningless the logits behind it. With `temperature: 0` it is also
deterministic. So a broken run looks exactly like a successful one to everything
downstream: it validates, it stores, the task reports success, and the scheduled
backfill then skips that video forever because it has a record. A whole night of
scheduled analyses was lost this way.

### The measurement that matters

Prompt size decides it. Measured with Mesa 25.0.7, llama.cpp b10733, Qwen3.5-9B:

| Prompt | Result |
| --- | --- |
| 148 tokens | correct classification |
| 584 tokens | `interview`, confidence `-1111111111111111E-1111111111111111` |

The threshold sits somewhere between. Any real transcript is thousands of tokens, so in
practice the feature is unusable on this hardware — but note the corollary: **a short
test passes**. The first version of the built-in self-test used a short fixture and
reported a broken engine as healthy.

### The cross-vendor control

The same llama.cpp build (b10733, commit `234a6eb`), the same model file, the same
grammar and the same prompt, on an NVIDIA RTX 5080 over **Vulkan**: correct every time.
Also correct on that card over CUDA, and correct on the Intel chip's own CPU.

That isolates it to Intel's driver. It is not the llama.cpp version, not the Vulkan
backend in general, and not the model.

## What was ruled out, and how

Recorded because each of these looked convincing at the time, and re-deriving them
costs hours.

**Flash Attention.** Plausible: llama.cpp enables it automatically on GPU and not on
CPU, which matches a CPU-good/GPU-bad split exactly, and its Vulkan kernels are newer
and less exercised. Ruled out by running with `-fa off` — still corrupt.

**The llama.cpp version.** Ruled out by the cross-vendor control above: the container's
exact pinned build is correct on other silicon.

**State reuse between requests.** The theory was that a warm server carried something
between generations. Ruled out by restarting the container and analysing immediately —
first request, still corrupt.

**Transcript length as opposed to prompt length.** The failing call is the
classification, which deliberately runs *without* the transcript. So it is prompt size
in general, not the transcript.

**Motherboard or BIOS.** Never seriously in play once the shape was clear: a
board-level fault does not spare Whisper, the model load, and all ungrammared
generation while hitting exactly one code path.

## Mesa: what the update did

The image shipped Debian bookworm's `mesa-vulkan-drivers` 22.3.6 — February 2023, the
same month Alder Lake-N launched. It now installs 25.0.7 from `bookworm-backports`.

That **moved the threshold rather than removing it**. On 22.3.6 a ~250-token prompt was
already corrupt; on 25.0.7 it takes about twice that. An improvement, and a useless one,
since real prompts are far above both.

It is kept on its own merits: the package set is marginally *smaller* than bookworm's
(measured, 468MB vs 477MB of `/usr`), it is the same driver AMD users get, and shipping
a 2023 driver was never a decision anyone took deliberately.

One trap it introduced, worth knowing if the base image ever changes again:
`llama-server` links `libssl.so.3` through libcurl, and nothing installed it — bookworm's
Mesa happened to pull `libssl3` in transitively, so it worked by accident for as long as
it existed. Backports Mesa does not, and the binary died with exit 127 before printing a
line of its own. `libssl3` is now named explicitly in the Dockerfile.

## Caveats — read this before relying on any of the above

**This is one machine.** Every measurement here comes from a single i3-N305 running
Unraid, with one model, at one moment. Nothing has been tested on Intel Arc, on an older
Intel iGPU, or on AMD at all. "Intel is broken" is shorthand for "this Intel chip on
this driver was broken"; treat other hardware as unknown rather than as covered.

**The threshold is soft and may not be a threshold.** 148 tokens worked and 584 did not;
nobody has bisected between them, and it is an assumption rather than a finding that the
boundary is stable. It may vary with the schema, the model, the context size, or the
phase of the moon. Do not build anything that depends on a safe prompt size.

**Any of the moving parts can change the answer.** Mesa, llama.cpp, the model file, the
container base and the kernel all update independently, and this bug lives in the
interaction between them. A future Mesa may fix it outright; a future llama.cpp may
change which kernels run. **When something here stops matching reality, believe the
machine, not this document.**

**Detection is the durable part, not the diagnosis.** The specific cause matters less
than the fact that this failure mode is invisible: grammar-constrained output cannot
fail a schema check, so nothing downstream can tell a broken engine from a working one.
Whatever the cause turns out to be next time, the way you find out is the same —
analyse something with a known answer and read the answer.

**Whisper on Mesa 25 has not been verified.** It uses the GPU on the same chip through
the same driver, which was updated underneath it. It takes no grammar and should be
unaffected, but that is reasoning, not evidence. `describeTranscript()` in `whisper.ts`
logs cue count, character count and distinct-line percentage on every run, and warns on
a repetition loop — that is the thing to check.

## The self-test

Settings → AI Analysis → "Check it actually works" (`utils/ai/self-test.ts`) exists
because of all of the above. It analyses a built-in transcript with a known answer and
reads the answer, rather than checking that one arrived.

Two calibration lessons are baked into it, both learned by getting it wrong:

- **The fixture must be long enough to fail.** It was short at first and passed on a
  machine where every real analysis was corrupt.
- **The expected answer must be calibrated against a healthy engine, not against what
  the fixture "obviously" is.** It first asserted `platform_tech_review`; a working 9B
  says `tech_explainer` every time, so that assertion would have failed good engines on
  every run. It now accepts any sane reading and fails only the `interview`-class
  answers actually seen from broken ones.

The degeneracy check counts letters before words, for the same reason: the observed
corruption was `( ( ( (` repeated, which contains no words at all, so a word-ratio
measure found nothing to judge and reported it fine.

## Hardware video encoding: not available, then fixed

Unrelated to the above but discovered alongside it. The bundled `ffmpeg-static` on Linux
has no hardware encoder compiled in - `libx264`, `libx264rgb`, `h264_v4l2m2m` and `aac`,
and v4l2m2m is the embedded-SoC wrapper, nothing an x86 integrated GPU offers. Asking
for `h264_vaapi` produced `Unknown encoder` and killed the stream.

That mattered more than it first appeared. Browser playback only re-encodes video when
the file is not H.264, which sounds rare until you count: of the formats Digital
Foundry offers, 856 entries are 4K HEVC against 869 4K H.264, plus 40 at 1080p. No
browser plays HEVC, and `mediaFormats.priorities` selects on resolution alone - both 4K
entries score identically, so which codec you get is whatever order the listing
happened to be in. So a large share of the library needs a full 4K re-encode to play in
a browser, and `libx264 veryfast` does not hold realtime for that on a low-power box.

**The image now ships `jellyfin-ffmpeg7` instead.** Measured growth of `/usr` on the
runtime base, 2026-09-06:

| Build | Version | Added to /usr |
| --- | --- | --- |
| Debian bookworm `ffmpeg` | 5.1.9 | +440MB, +455MB with `intel-media-va-driver` |
| `jellyfin-ffmpeg7` | 7.1.4 | +277MB, drivers included |
| BtbN static, gpl | master | ~280MB for ffmpeg+ffprobe, driver package on top |

All three carry `h264_vaapi`, `hevc_vaapi` and the QSV equivalents. Jellyfin's wins on
size, is three major versions newer than Debian's, and is the only self-contained one -
it bundles its own iHD/i965 drivers and oneVPL rather than sharing the system's, so it
does not share a fate with the Mesa packages that already broke `llama-server` once.

`utils/ffmpeg-binary.ts` chooses the binary: `FFMPEG_BINARY` / `FFPROBE_BINARY` if set,
otherwise the bundled static build. The image sets both. Deliberately *not* "whatever
ffmpeg is on PATH" - silently preferring an unknown build over the pinned one changes
behaviour across an upgrade for a reason nobody can see.

**Licensing is unchanged**: `ffmpeg-static` is already configured `--enable-gpl
--enable-version3` and carries libx264, so the image has always contained a GPLv3
binary. jellyfin-ffmpeg is the same. It is spawned as a separate process rather than
linked, so the project's own ISC licence is unaffected; the standing obligation is to
offer corresponding source for the binary that is redistributed. An LGPL build would be
worse, not better - FFmpeg has no native H.264 encoder, so dropping libx264 would take
the software fallback with it.

**What is not verified.** Nobody has yet played a 4K HEVC file through `h264_vaapi` on
the i3-N305. The argument path in `buildArgs` was written against a binary that could
not run it, so its first real execution is still ahead. `canEncodeWithVaapi()` only
proves the encoder was compiled in; whether it initialises depends on the driver and on
`/dev/dri` being passed through, and that failure surfaces when a stream starts.

Worth keeping the silicon distinction in mind: Quick Sync is fixed-function media
hardware, entirely separate from the Vulkan compute path that causes the corruption
above. A machine where local analysis on the GPU is unusable can still encode video on
it perfectly well - which is exactly the case here.
