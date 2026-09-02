# Local AI analysis - phase structure and prompt wording, per model

Status: **investigation complete, nothing implemented** (2026-09-02). No file under
`df-downloader-common/`, `df-downloader-service/` or `df-downloader-ui/` was changed.
110 runs, 0 failures. Every figure was measured on this machine against the real stored
corpus, through the app's own compiled prompt and schema code in
`df-downloader-service/dist/`, so the prompts sent to the local models are byte-identical
to what the app sends.

> **Naming note (2026-09-02, after this was written).** Two content types have since
> been renamed: `console_comparison` is now `platform_comparison`, and
> `platform_analysis` is now `single_platform_analysis`. Measurements below are left
> under the names they were taken with, so the record matches the runs. Read the old
> names as the new ones when following a recommendation into the code.

Companion to `docs/LOCAL_AI_QUALITY_FINDINGS.md` and `docs/LOCAL_AI_ANALYSIS_SPIKE.md`.
Read the former first: this confirms its marker finding, replicates its 94%-vs-85%
headline, and then qualifies its model recommendation substantially.

## Verdict

**Three phases for both models. The split answer this task anticipated does not appear
on phase count - it appears on prompt wording and on payload shape instead.**

| | Qwen3.5-9B | Qwen3.6-35B-A3B |
| --- | --- | --- |
| Phase structure | **3-phase (as shipped)** | **3-phase (as shipped)** |
| Quote wording | **`qw3`, an anti-drop clause** - see below | **leave alone** |
| Transcript markers | keep, per-cue | keep, per-cue |
| 4-phase (tags split out) | rejected | rejected |

1. **Both models need classification split out, for the same reason and to different
   degrees.** Folding it back in costs the 9B its conclusion on 11 of 18 item-runs (61%
   against 94%) and the 35B on 4 of 30 (87% against a clean 100%). The 35B's version is
   mild but consistent - it lost a conclusion in four of five runs while the 3-phase
   design never lost one.
2. **Four phases is dominated on both models.** Giving tags their own call costs +45%
   wall clock and +38% prompt tokens on the 9B, and makes tagging *worse* on both.
3. **The article/transcript tension does not resolve by preferring transcript quotes.**
   Three independent attempts all bought a better anchor rate by destroying coverage.
   The one wording that works keeps the shipped instruction verbatim and only forbids
   *dropping* items - see `qw3` below. It is worth +2 points of located findings on the
   9B and nothing on the 35B, which never had the problem.
4. **The one unambiguous win is not a prompt change at all.** The models sometimes elide
   with `...`, joining two genuine transcript spans into one quote. Splitting on the
   ellipsis recovers **100% of them** - 45 of 45 on the 9B, 41 of 41 on the 35B - each
   with a verified transcript match rather than a guess. That is 6% of the 9B's
   unanchored findings and **30% of the 35B's**.

**On model choice the previous investigation's verdict needs qualifying.** Its headline -
the 35B reaching 94% located against the 9B's 85% - replicates exactly here (94% vs 84%).
But grounding was never checked against a payload with a known-right answer, and on that
axis the larger model is worse:

| | 9B | 35B |
| --- | --- | --- |
| Halo PC review - settings extracted | **10, 10, 10** | 6, 6, 6 |
| Resonance face-off - modes | **13, 13, 13** | 11, 11, 11 |
| Metro preview - observations | 10, 10, 10 | **13, 13, 13** |
| Weekly / Q+A - segments | 11 / 5 | 11 / 5 |

The 9B's ten Halo settings are a strict superset of the 35B's six, and all four extras -
Texture Quality, Post-Processing, Chromatic Aberration, Film Grain - are verifiable in
Digital Foundry's own article. **The 35B writes richer entries but fewer of them wherever
the payload is a list.** Same behaviour that gives it 2,262-character summaries against
the 9B's 1,460.

So the honest framing is a trade, not a ranking: **the 35B for better-grounded, more
detailed prose and open-ended findings; the 9B for more complete enumerable payloads, at
a third of the wall clock and a quarter of the RAM.**

## How this was measured

Six items, two models, 110 runs. Scoring is a separate pass over saved raw output, so
every configuration is graded by identical code and the locator can change without
re-running inference.

**Harness validation, before any result was trusted.** The hand-built content blocks,
marked blocks and system prompts were asserted byte-identical to `prepareAnalysis`'s own
output for all six items. The shipped configuration then reproduced the 2026-09-02
regression sniff test on the Halo item exactly: 1,371-character summary, 381-character
conclusion, 10 findings, 8 located, 6 tags, 17.1s against the recorded 17.6s.

**Two instruments, and they are not interchangeable.** A full-pipeline run makes all
three calls; an extraction-only run makes just the extraction call, three times faster,
and was used to afford more repeats of the wording work. They disagree, because the
preceding summary call warms the KV cache on the same content block and a cold extraction
prompt lands differently - full-pipeline `shipped` gives Halo 10/10/10 settings where
extraction-only gives 6/10. The gap is much larger on the 35B (Steam Controller 15/21
full-pipeline against 0/8 extraction-only), presumably because prompt processing is ten
times slower offloaded and the cache carries more weight. **Every recommendation below
rests on full-pipeline runs.** Extraction-only figures are marked as such and used only
to compare variants against each other.

**Phase count cannot affect extraction, and this is provable rather than assumed.**
Within a run, the extraction output is byte-identical across the 2-, 3- and 4-phase
designs in 28 of 30 item-runs on the 9B, and leaves and located counts are identical to
the decimal at n=5 on the 35B. Its prompt depends only on the classified content type,
which never varied. Any located-rate difference between those rows is noise, and the two
questions decompose cleanly.

**Leaf counts are not a quality axis** - this overturned an intermediate conclusion of
this very investigation. Structure that has a right answer is stable everywhere (13
modes, 11 Weekly segments, 5 Q+A segments, 10 Halo settings, all zero-variance across
runs); only open-ended fields move. An early reading had `qw1` "winning" on +6 findings
per run, until the payloads were read: the extra entries were the Series S spec-reduction
list stuffed into `knownIssues`, and the same run had *dropped* three genuine framerate
collapses. Findings are counted at the leaf - every quote-bearing object
`anchorFindings` walks - and the structural counts are reported separately.

### Grounding is judged on the quote alone, against both sources

Unchanged from the previous investigation, and still the thing most easily got wrong:

| Class | Meaning | Right response |
| --- | --- | --- |
| Located | Found in the transcript | Timestamp, guaranteed correct |
| Article-verbatim | Found in the article only | A correct citation with no moment |
| Invented | In neither | The actual bug |
| Null | No quote offered | Honest, and designed for |

**One refinement added here.** "Invented" conflates two different failures. A quote can
miss both sources and still be made entirely of their words - an article headline welded
to a sentence from its conclusion, or a transcript span with one word dropped. The
harness now decomposes every unlocated quote into the fewest contiguous spans that each
appear in a source. Wholly source-derived in more than one piece is **stitched**; words
belonging to no span at all are **unsupported**.

**That changes the picture materially. Genuine invention runs 0-1%, not the 3-6%
previously reported.** Almost everything scored as invented is stitched. The models are
substantially more honest than the metric suggested; what they are bad at is copying
contiguously.

## Results

### Phase structure - Qwen3.5-9B, full pipeline, 3 runs each (18 item-runs)

| Config | Type | Game | Conclusion | Summary | Concl. chars | Leaves/run | Located/run | Located | Article | Invented | Tags | s/run | Prompt tok |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **3-phase (shipped)** | 18/18 | 18/18 | **94%** | 1,460 | 404 | 61.7 | 52.0 | 84% | 10% | 3% | 7.4 | 116 | 132k |
| 2-phase | 18/18 | 18/18 | **61%** | 1,697 | 278 | 61.7 | 52.0 | 84% | 10% | 3% | 7.7 | 109 | 124k |
| 4-phase | 18/18 | 18/18 | 94% | 1,540 | 389 | 62.0 | 52.0 | 84% | 10% | 3% | **12.1** | **168** | **182k** |

Per-run conclusions present, out of 6: 3-phase 6/5/6, 2-phase **4/4/3**, 4-phase 5/6/6.

### Phase structure - Qwen3.6-35B-A3B, full pipeline

| Config | runs | Type | Game | Conclusion | Summary | Leaves/run | Located | Tags (violations) | s/run | Prompt tok |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **3-phase (shipped)** | 5 | 30/30 | 30/30 | **100%** | 2,262 | 63.2 | 94% | 8.9 (18) | 377 | 132k |
| 2-phase | 5 | 30/30 | 30/30 | **87%** | 2,074 | 63.2 | 94% | **6.2 (7)** | 352 | 124k |
| 4-phase | 3 | 18/18 | 18/18 | 100% | 2,086 | 62.0 | 95% | 9.4 (15) | **401** | **182k** |

Per-run conclusions present, out of 6: 3-phase **6/6/6/6/6**, 2-phase 5/6/5/5/5.

At n=2 the 2-phase design looked nearly free on the 35B - one lost conclusion in twelve.
At n=5 it loses one in four of five runs while 3-phase is a clean sweep. **Deciding this
at n=2 would have produced the wrong recommendation**, which is the single most useful
methodological result here.

### Quote wording - Qwen3.5-9B, full pipeline, 3 runs each

| Config | Conclusion | Leaves/run | Located/run | Located | Article | Invented | Halo settings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| shipped | 94% | 61.7 | 52.0 | 84% | 10% | 3% | **10, 10, 10** |
| `qw1` transcript-first | 100% | 67.7 | 55.0 | 81% | 12% | 5% | 10, 7, 6 |
| `qw2` + "copy the scruffy version" | 94% | 60.0 | 49.7 | 83% | 10% | 7% | 6, 5, 6 |
| **`qw3` anti-drop** | 89% | 64.0 | **55.0** | **86%** | **9%** | 4% | 9, 10, 8 |

`qw3` is the recommendation, with a caveat stated plainly: it gains +3 located findings
per run, outside the measured noise band (54-56 against 50-53, non-overlapping ranges),
and moves article-only citations from 10% to 9% - but Halo settings came back 9, 10, 8
against a rock-solid 10, 10, 10. It reduces the coverage damage the other wordings cause
rather than eliminating it. On the nine-item corpus it repeats: 87% located against 84%,
article 3% against 7%.

Its clearest single win is the item that defeated every other configuration. On the
nine-item runs, Steam Controller went from **3/18 located to 12/21**.

### The nine-item extension corpus, 3 runs each

`platform_analysis` is 26% of the analysed library and had no benchmark item; neither did
`roundup_list`. Three were added - Starfield PS5/Pro and MGS Master Collection
(`platform_analysis`), MSI Ultrawide (`roundup_list`). **Reported separately, never folded
into the six-item baselines**, which were already closed.

| Config | Type | Game | Conclusion | Leaves/run | Located | Article | s/run |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 9B shipped | **24/27** | 27/27 | 100% | 92.0 | 84% | 7% | 173 |
| 9B `qw3` | **24/27** | 27/27 | 100% | 87.0 | **87%** | 3% | 167 |
| 35B shipped | **24/27** | 27/27 | 100% | 92.0 | 84% | 1% | 621 |

**Content type is no longer 6/6. That invariant was an artefact of the six-item corpus.**
Both models score 8 of 9, and they miss *different* items, consistently across every run:

| | MSI Ultrawide (`roundup_list`) | MGS Master Collection (`platform_analysis`) |
| --- | --- | --- |
| 9B | correct | **`game_retrospective`** |
| 35B | **`other`** | correct |

Both misses are defensible taxonomy ambiguities rather than errors:

- **MGS -> `game_retrospective`.** `CONTENT_TYPES` defines that as "a look back at an
  older game, or an anniversary re-release", which fits a Master Collection revisit
  exactly - but it also gives `platform_analysis` "a 'have they fixed it yet' revisit",
  which fits equally. The two definitions overlap for a patch revisit of a re-release.
- **MSI -> `other`.** "PC Gaming: The Ultrawide Display Experience - Our Picks For The
  Best Games [Sponsored]" is a best-of games list by the letter of `roundup_list`, but
  sponsored content framed around a monitor.

**The consequence is larger than a wrong label.** Both `game_retrospective` and `other`
are non-extractable, so each miss costs the *entire* structured payload. `roundup_list`
therefore remains the only content type never exercised end-to-end, even after an item
was added for it - because on the 35B the classifier never routes anything to it.

Both `platform_analysis` items otherwise work well. Structure was identical across all
three runs of each model: Starfield 2 platforms / 8 modes / 6 issues, MGS 5 platforms /
9 modes / 6 issues on the 35B. **The quarter of the library that was never benchmarked
is not broken.**

### Timing, and which figures are offload-bound

The 9B fits entirely on the RTX 5080 (`-ngl 99`). The 35B does not, in either
quantisation, and runs with `--cpu-moe` - attention on GPU, experts on CPU. Wall-clock
comparisons *between* the models are therefore not like-for-like; comparisons between
permutations of the same model are.

From llama-server's own `timings`, 282 calls:

| | Prompt processing | Generation | Prompt tok/s | Generation tok/s |
| --- | --- | --- | --- | --- |
| 9B, all on GPU | 9.9% | 90.1% | 6,229 | 125.9 |
| 35B, `--cpu-moe` | **37.1%** | 62.9% | **590** | 55.9 |

Prompt processing is **ten times slower** offloaded while generation is only 2.25x
slower, which is why the phase split shifts so far. Per-call weights within one analysis
(9B, shipped): classify 0.7s / 3.7%, summary 5.9s / 30.2%, **extraction 12.8s / 66.1%**.

Full nine-item runs: 9B 173s, 35B 621s - **3.6x**.

## Recommendations

Each is tied to the code that would change, and to the evidence that would confirm it
worked.

**1. Split ellipsis-joined quotes before locating (`transcript.ts`, `locateQuote`).**
The highest value-to-risk item here, and it is not a prompt change. Split the quote on
`...` / `…`, discard fragments under ~5 words, and locate the longest remaining segment.
Recovered 45 of 45 on the 9B and 41 of 41 on the 35B - a 100% rate on that subset,
covering 6% and **30%** of each model's unanchored findings. Every recovered timestamp
comes from a verbatim transcript match, so it cannot produce a wrong time; the guarantee
the current design is built on is preserved. It belongs beside `stripPositionMarkers`,
which solves the same class of problem. *Confirmation: unanchored findings containing an
ellipsis should fall to zero, and no located timestamp should change.*

**2. Keep `separatesClassification: true` for both models (`providers/llama-cpp.ts`).**
Already correct. The comment says "Measured: classifying in the same call costs it most
of the summary" - that now also holds for the 35B, more mildly. Worth recording that the
flag is not 9B-specific, in case a future engine tempts someone to unset it. *Evidence
against changing it: 2-phase loses the conclusion on 11 of 18 item-runs (9B) and 4 of 30
(35B).*

**3. Adopt `qw3` for the local provider only (`prompts.ts`, `QUOTE_INSTRUCTION`).**
Keep the shipped text verbatim and append one clause making coverage and citation
separate decisions - that failing to find a quote is never a reason to omit an item. The
exact wording measured is in the harness; the load-bearing sentence is that dropping a
real item to avoid an awkward quote is the worst outcome. **Do not apply it to the
hosted path or to the 35B**: the 35B posts 0-1% article-only citations, so it has nothing
to fix, and adding the clause raised its elision rate. This needs a per-provider
instruction, which the codebase does not currently have - `buildExtractionInstruction`
takes `PromptFlags`, so the cheapest route is another flag rather than a new builder.
*Confirmation: article-sourced findings should fall roughly 10% -> 9% with located rising
84% -> 86%, and Halo settings must stay at 10 - a drop to 5-7 means the coverage failure
has reappeared.*

**4. Do not split tags into their own call.** Measured and rejected on both models - see
below. No code change; recorded so it is not re-proposed.

**5. Consider making `game_retrospective` extractable, or tightening its boundary
against `platform_analysis` (`prompts.ts` `CONTENT_TYPES`, `analyse.ts`
`EXTRACTABLE_TYPES`).** The 9B routes a Master Collection revisit there and loses the
entire platform table as a result. Either the definitions need to separate "revisit of an
old game" from "revisit of a game's technical state", or `game_retrospective` needs a
payload. *Confirmation: the MGS item should return a platform table with roughly 5
platforms and 9 modes, which is what the 35B produces when it classifies it correctly.*

## What did not work

**Preferring the transcript for quotes - three separate attempts, all regressions.** This
was the brief's "probably the largest single remaining win", and the answer is no, with a
mechanism. `qw1` told the model the article establishes what is true while the transcript
establishes when it was said, and that an article quote is second choice rather than
worthless. `qw2` added that the spoken version is rambling and should be copied anyway.
Withholding the article from the extraction call entirely (`ex-noart`) is the same idea in
its strongest form.

All three improved the anchor rate and all three destroyed coverage. Halo settings, per
run: shipped 10/10/10, `qw1` 10/7/6, `qw2` 6/5/6, `ex-noart` **5/5/5/5/5** with zero
variance. That last figure is the cleanest measurement in the investigation: **the article
contributes exactly half of that payload, deterministically.** `qw2` at 5-6 settings lands
precisely on the failure `BOTH_SOURCES_COUNT` was written to fix.

The mechanism is that **the model reads "prefer the transcript for the quote" as "prefer
the transcript for the content"**, and coverage follows the quote instruction. The
improved rates were arithmetic: having dropped the article-sourced items, the article-
sourced citations went with them. Any future attempt at this needs to protect coverage
first, which is what `qw3` does.

**Splitting tags into a fourth call.** Rejected on both models. On the 9B: +45% wall
clock, +38% prompt tokens (the tags call re-sends the whole transcript), and tagging got
*worse* - 12.1 tags per item against 7.4, with more violations of the naming rules in
`buildTaggingInstruction`. On the 35B: 401s against 377s and 182k prompt tokens against
132k, for no conclusion benefit.

**Markers every 15 seconds - a reproducible catastrophic failure.** `m15` returned **1
platform and 4 modes** for the Resonance face-off in all five runs, against the universal
4 platforms / 13 modes. Its apparently excellent 83% located rate was pure artefact of
producing a third of the findings. This is worth recording precisely because the summary
metric flattered it: **no marker-density change should be accepted on anchor rate without
checking the structural counts.**

**A contraction- and hyphen-insensitive matching rung** was already rejected by the
previous investigation, recovering zero findings. Nothing here contradicts that - the
recoverable cases are ellipsis elisions and dropped words, which need span decomposition
rather than looser character matching.

## An unexpected result worth separating out

**Folding classification back in produces fewer and better tags, on both models.** Rule
violations counted against `buildTaggingInstruction`: 35B 7 (2-phase) against 18
(3-phase); 9B 10 against 17. The 35B also drops from 8.9 tags per item to 6.2, closer to
the restraint the instruction asks for.

This is not a reason to change phase count - the conclusion loss outweighs it - but it
suggests **the tagging instruction interacts badly with being asked alongside games,
summary and conclusion**, and that the tagging prompt is worth revisiting on its own. The
spike already flagged tag phrasing as the one genuine regression against Claude and said
it was never re-tuned. This is a second piece of evidence pointing at the same place.

## What was not tested, and why

- **Optimal marker density is not determined.** Markers versus none is settled and
  replicated in both instruments (77% -> 84% located on the 9B, full pipeline). But
  extraction-only runs at n=5 put `m60` at 86% located against per-cue's 80%, at fewer
  tokens, while `m15` fails catastrophically. Sparse markers may be a real saving, but
  the only trustworthy instrument (full pipeline) covers only none / 30s / per-cue.
  **A dedicated full-pipeline run of `m60` is the obvious follow-up.** Per-cue is what
  ships, is safe, and nothing here argues for changing it blind.
- **The 35B's extraction-only figures are not usable as absolutes** - see the two-instruments
  note. They compare variants, nothing more.
- **`qw3` on the 35B was measured extraction-only** (89% located against 90%, elision up
  from 6% to 11%) and never in the full pipeline. The recommendation not to apply it there
  rests on that plus the fact that the 35B has 0-1% article citations to reclaim.
- **The MGS item's transcript is not the same kind as the others.** It came from an
  embedded `mov_text` track with `[Music]` as its first cue and 37-character cues against
  63-90 for the Whisper sidecars - YouTube captions, not Whisper. Marker density per word
  is roughly double as a result. If its numbers ever sit apart from the rest, transcript
  provenance is a candidate explanation before model behaviour.
- **`roundup_list` still has no end-to-end exercise**, despite now having an item, because
  the 35B classifies it `other` and the 9B's correct classification was only measured at
  n=3.
- **No Anthropic calls were made.** Claude figures quoted anywhere here come from
  `.ai-benchmark/` and the previous investigation.
- **The microserver itself.** Every figure is from this desktop; the 35B numbers are
  offload-bound and an N305 will not match them.
- **Whether the 2-phase tag improvement survives** a tagging-prompt revision, which is the
  actual fix that finding points to.

## Progress reporting - a secondary investigation

Answered in passing while the main runs were in flight; recorded here rather than
separately.

- **`stream: true` works alongside `response_format: {type: "json_schema", strict: true}`.**
  Returns `200 text/event-stream`, the grammar constraint survives intact (assembled
  output parsed clean against the zod schema), and it emits **one chunk per token** -
  1,139 chunks for 1,138 generated tokens. This is the signal to build on.
- **The final streamed chunk carries the full `timings` object**, so streaming costs
  nothing in accounting: `cache_n`, `prompt_n`, `prompt_ms`, `predicted_n`,
  `predicted_ms`, and per-second rates for both phases.
- **`GET /slots` exposes a live generation counter at `next_token[0].n_decoded`**, which
  advances smoothly during a request. It is nested; a top-level `n_decoded` is `undefined`
  and reads as "no such field".
- **`/slots` cannot give a prompt-phase percentage.** `n_prompt_tokens_processed` advances
  only in `n_batch` (2048) jumps - four distinct values across a 5,683-token prompt - and
  `n_prompt_tokens` is context-used rather than prompt size, growing during generation.
- **There is no request-to-slot correlation.** `id_task` is a server-side counter never
  returned to the client. It does not matter here: `localComputeGate.withExclusive` means
  only one slot is ever `is_processing`.
- **`/metrics` returns 501** (`endpoint_metrics: false`); it needs `--metrics` at launch
  and is server-wide anyway.
- **Show generation, not prompt processing - except on the offloaded path.** Generation is
  90% of the wait on the 9B but 63% on the `--cpu-moe` 35B, where prompt processing is a
  third of it. Weight any composite bar by the per-call figures above: extraction is two
  thirds of an analysis.
- **`timings.cache_n` reached 21,440 on repeat calls.** The pipeline sends the same content
  block to the summary call and then the extraction call, so the second is a large cache
  hit by construction and prompt progress is non-linear.

## Reproducing

Harness is in the session scratchpad, deliberately throwaway, and reads the DB from
snapshots rather than the running service.

- `validate.mjs` - asserts the harness's prompts are byte-identical to `prepareAnalysis`'s.
  Run this first; nothing else is trustworthy without it.
- `run.mjs <variant> <run> [model]` - full pipeline. `CORPUS=ext9` adds the three
  extension items and tags the output so it can never be aggregated with a six-item
  baseline.
- `run-extract.mjs <variant> <run> [model]` - extraction call only, ~3x faster.
- `score.mjs`, `aggregate.mjs`, `structure.mjs` - grading, the tables above, and the
  structural counts that leaf totals hide.
- `probe.mjs` - the streaming and `/slots` capability probe.

**The tree moved during this investigation, and the results were re-validated against it.**
Four commits landed while runs were in flight (`38cb747`, `d36cd69`, `6475df1`, `150da73`)
and `dist/` was rebuilt mid-session. Since the harness imports from `dist/`, that could
silently have meant early runs measured different prompts from later ones. It did not:
`prompts.ts`, `transcript.ts` and `wire-schemas.ts` were untouched by those commits, and
the check was done empirically rather than from timestamps - the exact tokenizer counts
stored at run time before the rebuild were recomputed against the rebuilt `dist/` and
matched to the token for all six items (Weekly 21,865, Q+A 14,123, Resonance 8,003, Metro
6,260, Halo 5,984, Steam Controller 9,163). `analyse.ts` and `llama-cpp.ts` did change,
but nothing in the measurement path imports them. **If this document is re-read after
further work on the AI code, repeat that check before trusting the figures.**

Three harness lessons worth keeping, beyond the two the previous investigation recorded:

1. **Never point two benchmark processes at one llama-server** (inherited, and respected
   throughout - the capability probes waited for batches to drain).
2. **Judge quote grounding before consulting any model-supplied timestamp** (inherited).
3. **The driver pipes through `grep`, which block-buffers.** An apparently stalled log is
   usually a buffering artefact; check `/slots` for `is_processing` before diagnosing a
   hang. Two false alarms were raised this way.

**Two of the six items have lost their `downloads` array** in
`df-downloader-service/db/content-status-db.json` - `yt-VbbWdn0TFRU` and `yt-VMstfBYpdmg` -
while the `.mp4` and `.eng.srt` sit on disk. This is present in the live file, not a racy
read. The harness works around it by matching media off disk, but **it is a real data
problem in the dev database and would present in the app as "this video has no
transcript".**
