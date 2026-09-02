# Which local model to run, and why

Standing guidance rather than an investigation record. The three `LOCAL_AI_*` findings
documents each capture one investigation at one point in time; this one says what the
answer currently is and points at them for the measurements.

**Short version: run Qwen3.5-9B. It is the default, and switching to the 35B is a trade,
not an upgrade.**

## The recommendation

| | Qwen3.5-9B | Qwen3.6-35B-A3B |
| --- | --- | --- |
| Memory | 5.6GB — fits a 12GB card | 22.4GB resident — realistically a 32GB machine |
| Nine-item run | 173s | 621s (**3.6x**) |
| Quotes that locate | 84% | **94%** |
| Halo settings extracted | **10, 10, 10** | 6, 6, 6 |
| Face-off modes extracted | **13** | 11 |
| Summary length | 1,460 chars | 2,262 chars |

## Why the bigger model is not simply better

The original spike recommended the 35B on one metric: the share of quotes that
successfully locate against the transcript, 94% against 84%. That number replicated
exactly in the follow-up work, so it is not in doubt.

What the spike never measured was **grounding against a payload with a known-right
answer** — not "did the quote locate" but "did it find everything that was there". On
that axis the ranking inverts. The 9B's ten Halo settings are a strict superset of the
35B's six, and all four extras (Texture Quality, Post-Processing, Chromatic Aberration,
Film Grain) are verifiable in Digital Foundry's own written article. The same pattern
holds on face-off modes: 13 against 11.

The single sentence that explains it: **the 35B writes richer entries but fewer of them
wherever the payload is a list.** The same trait that produces its longer, better summaries
produces its shorter tables.

So neither model is more accurate in general. They fail differently:

- The 9B under-quotes. Findings are right, but fewer carry a timestamp you can click.
- The 35B under-enumerates. What it reports is well-written and well-grounded, but it
  leaves real rows out of tables.

For this application the tables are most of the point, so the 9B's failure mode is the
cheaper one — and it costs a third of the wall clock and a quarter of the memory to get it.

## When the 35B is the right call

It is a considered alternative, not a trap. Choose it when:

- You have the memory spare — 32GB, and not competing with Whisper or downloads.
- You care more about the written summary and conclusion than the extracted tables.
- The content you analyse is mostly prose-shaped: interviews, retrospectives, Directs —
  formats where there is no table to under-fill.

Do not choose it because it "scores higher". The score it wins on measures citation, not
coverage.

## Hardware guidance

Because the 9B is the recommendation, **12GB of VRAM is the realistic floor and is
genuinely enough**. The 22GB figure that appears throughout the findings documents is the
35B's requirement and should not be read as this feature's requirement.

The 35B does not fit a 16GB card in either quantisation, so it runs with `--cpu-moe`
(attention on GPU, experts on CPU). That is why its wall-clock penalty is so large:
prompt processing drops from 6,229 tok/s to 590 — ten times slower — while generation
only halves. Anything that cannot keep it cached in RAM will read from disk per token and
be unusable.

Q3 quantisation was tested as a way to fit the 35B into less memory and rejected; see
`LOCAL_AI_QUALITY_FINDINGS.md`.

## Prompting differs by model

Worth knowing if you change prompts: the extraction prompt is **not** identical across
engines. The 9B receives an extra quote-coverage clause telling it that whether an item
belongs in the answer and whether it can be quoted are separate decisions, because it
otherwise drops real findings rather than cite them awkwardly. The 35B and the hosted
Anthropic path do not receive it — they have no such problem, and on the 35B it made
elision worse.

This is declared per model, not per engine: `needsQuoteCoverageClause` on
`AiLocalModelInfo` in `df-downloader-common/src/config/ai-analysis-config.ts`, surfaced to
the prompt builder as `AiProvider.usesQuoteCoverageClause`. Adding a third local model
means deciding this for it.

## Where the numbers come from

- `LOCAL_AI_ANALYSIS_SPIKE.md` — the original model comparison and the 94%/84% figure.
- `LOCAL_AI_QUALITY_FINDINGS.md` — memory, quantisation, the model landscape, and the
  framing rule for judging grounding. **Read its framing rule before measuring anything
  here**: quotes must be judged against the transcript *and* the article, never the
  transcript alone.
- `LOCAL_AI_PHASE_AND_PROMPT_FINDINGS.md` — 110 runs covering phase structure, quote
  wording, and the payload-completeness measurements that produced the inversion above.
  Its tables use the pre-2026-09-02 content type names.
