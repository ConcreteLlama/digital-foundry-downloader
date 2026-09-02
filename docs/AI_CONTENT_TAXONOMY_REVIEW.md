# AI content taxonomy - end-to-end review

Status: **investigation complete, three changes implemented** (2026-09-02). Supersedes
the one-type question in `.ai-benchmark/DELEGATE_PROMPT_INTERVIEW_TYPE.md`, which turned
out to be one instance of a general problem.

Companion to `docs/LOCAL_AI_QUALITY_FINDINGS.md` and
`docs/LOCAL_AI_PHASE_AND_PROMPT_FINDINGS.md`. **Read the grounding-framing rule in the
former before quoting any figure here**, and note that the latter's tables still use the
pre-rename type names on purpose.

1,100 classification calls over 481 real items, both engines, plus $0.22 of hosted calls.
Every prompt was built by the app's own compiled `prepareAnalysis` rather than
reimplemented, and `validate.mjs` asserts that before anything else runs.

## Verdict

**The taxonomy has twelve types and roughly ten types' worth of work for them to do. One
boundary accounts for about three quarters of all classification error, and it is the
boundary between the two types that share a payload schema.**

| | measured |
| --- | --- |
| Content-type accuracy, new names | **57/69 (82.6%)** strict, 62/69 (89.9%) lenient |
| Content-type accuracy, old names | 55/69 (79.7%) strict, 60/69 (87.0%) lenient |
| Hosted engine (Haiku), new names | 54/69 (78.3%) strict, 61/69 (88.4%) lenient |
| Items the rename moved | 46/481 (9.6%) |
| Errors on the `platform_comparison` / `single_platform_analysis` boundary | **9 of 12** (9B), **9 of 15** (Haiku) |
| Engine disagreements on that same boundary | **10 of 14** |

1. **The rename was a small real improvement, not a regression.** The previous 8/9 figure
   could not survive a prompt change and had to be re-derived; on a proper sample the new
   wording is +2 items strict over the old (82.6% against 79.7%) and it moved 46 of 481
   items. It also fixed the specific failure that
   `LOCAL_AI_PHASE_AND_PROMPT_FINDINGS.md` recommendation 5 was written about - the MGS
   Master Collection item now classifies `single_platform_analysis` instead of
   `game_retrospective`, and four items moved off `game_retrospective` the same way.
2. **`platform_comparison` and `single_platform_analysis` should be merged, under a name
   that is neither of theirs.** They have no payload distinction worth two branches, they
   hold 45.9% of the library between them, and the classifier cannot tell them apart -
   the boundary is where three quarters of all error lives, on both engines
   independently. Keep the *shape* of `AiSinglePlatformAnalysisData`, which is a strict
   superset; keep neither *name*, because both assert a breadth the payloads contradict.
   Breadth returns as a derived filter on `platforms.length`, which is a fact rather than
   a guess. This review implements the consequence rather than the merge itself; see
   "The ledger" and "What to do next".
3. **The ledger now takes both**, because filtering on that boundary was never
   separating face-offs from port analyses - it was dropping an arbitrary half of each.
4. **`interview` now extracts**, routed to the existing segment shape. This is the
   cheap change the brief asked for and it works, but it is a 1.2%-of-library type and
   should not be mistaken for the important finding.
5. **Confidence is worthless on the local engine.** Minimum `contentTypeConfidence` is
   **0.95 for every one of the twelve types across all 481 items**. Nothing can be gated
   on it, and any argument resting on a type "classifying confidently" needs rechecking.

## How this was measured, and the one thing that would invalidate it

**Classification is transcript-free by design.** `analyse.ts` re-prepares the classify
call with `sources.transcript = false`, and `buildClassificationInstruction` says so to
the model. That is what made this affordable: no downloads, no Whisper, ~1.1s per call.

It is also a substantive limit on every conclusion here. **The classifier never sees the
video.** It sees the title, the description, the chapter list, and Digital Foundry's
companion article. Any claim that a type is inferred "from content" is false by
construction, and one of the brief's premises turned on exactly that - see the interview
section.

**Population**: the 481 items in the dev database that have cached article text. That is
production-like for the classify call, which does receive the article.

**Labels**: a systematic sample (every 7th, n=69), labelled **blind from titles before
any model output for those items was looked at**. Ordering matters and is the only reason
the figure is quotable. Labels carry an `alt` where the definitions genuinely admit a
second reading; results are reported strict (label only) and lenient (label or alt) so
the definitional slack is visible rather than hidden inside one number.

Where I found myself unable to choose between two types while labelling, that is recorded
in `labels.mjs` and is itself a finding - it happened 17 times in 69.

## 1. Is the taxonomy right?

Counts are from the 481-item sweep under the new names. "Distinct payload" asks whether
the type implies a shape its neighbours do not.

| Type | n (of 481) | Extracts | Distinct payload? | Verdict |
| --- | --- | --- | --- | --- |
| `platform_comparison` | 109 | yes | **no - identical to the next row** | **merge candidate** |
| `single_platform_analysis` | 112 | yes | **no - identical to the row above** | **merge candidate** |
| `pc_review_settings` | 54 | yes | yes - settings table | keeps its place |
| `news_discussion` | 81 | yes | shared segments, distinct label | keeps its place |
| `hardware_review` | 54 | yes | yes - products + gamesTested | keeps its place |
| `hands_on_preview` | 24 | yes | yes - observations, no numbers | keeps its place |
| `tech_explainer` | 21 | **no** | would need one | **coherent, and losing data** |
| `game_retrospective` | 13 | **no** | none of its own | **fold into the merged type** |
| `roundup_list` | 6 | yes | shared segments | thin but harmless |
| `interview` | 6 | **now yes** | shared segments | thin; see section 3 |
| `qa_roundtable` | 1 | yes | shared segments | thin in this sample only |
| `other` | **0** | no | n/a | keeps its place as an escape hatch |

### The two that have no payload distinction

`AiPlatformComparisonData` and `AiSinglePlatformAnalysisData` are the same object.
Both carry `game`, `developer`, `platforms: AiPlatformEntry[]`, `knownIssues`. The
differences are:

- `recommendation` versus `verdict` - **the same claim under two names.** The ledger
  change now reads one into the other, which is the proof.
- `changeSummary`, present only on the single-platform type.

So the real question is whether `changeSummary` justifies two branches. It does not,
because **breadth does not separate them in the data**:

- MGS Master Collection, classified `single_platform_analysis`, returns **5 platforms and
  9 modes** - a *wider* spread than the Resonance face-off's 4 platforms. Zero variance
  across three runs.
- Starfield PS5/PS5 Pro, same type, returns 2 platforms and 7-8 modes. Zero variance
  across six runs.
- Going the other way, genuinely comparative pieces land in the single-platform type
  ("Baldur's Gate 3 PlayStation 5 vs PC") and genuinely single-platform pieces land in
  the comparison type ("Skyrim - Switch 2 Review"), depending on engine and run.

`changeSummary` is a real and useful field. It is a *field*, not a type. The honest shape
is one type with an optional `changeSummary`, which is exactly what
`AiSinglePlatformAnalysisData` already is - so the merge keeps that schema and retires
`AiPlatformComparisonData`.

**That is a decision about the shape, not about the name, and the two should not be run
together.** Neither name survives. "Single" is false for a payload that returned five
platforms for MGS and four for Tomb Raider Remastered; "comparison" is false for one that
returned a single PS5 Pro column for Crimson Desert. Both encode a claim about breadth
that the extracted data contradicts - the same mistake `console_comparison` made about
hardware kind, and the reason that name was retired in the first place. The merged type
needs a breadth-neutral name; see "What to do next".

The deeper reason this is safe is that **breadth is a property of the payload, not of the
piece.** `platforms.length` is a fact sitting in the extracted data, so asking a
classifier to predict it from a title - before extraction has run - is asking it to guess
something the pipeline is about to establish for certain. That is why it fails at 9 of 12,
and why nothing is lost by removing the question.

### `other` earns its place, but only on one engine

Zero of 481 on the local engine, under both wordings. The 9B never reaches for the escape
hatch. Haiku does - 4 of the 34 stored analyses are `other`, including "Apple MacBook Neo
Review: A Brilliant Budget Laptop", which is a `hardware_review` by the letter of the
definition ("a graphics card, CPU, handheld, display or complete machine").

That is worth recording as an engine difference rather than a taxonomy problem: `other`
is doing nothing at all locally and is doing too much hosted. Both stored `other` items
that are plainly about one game also lost `primaryGame`, so a wrong type costs the game
filing as well as the payload.

## 2. Where the boundaries actually fail

Measured, not inspected. Three independent signals agree on the same answer.

| Signal | Result |
| --- | --- |
| 9B errors against blind labels | 9 of 12 on `platform_comparison` / `single_platform_analysis` |
| Haiku errors against blind labels | 9 of 15 on the same boundary |
| 9B vs Haiku disagreements | 10 of 14 on the same boundary |
| My own labelling hesitations | 17 of 69 items needed an `alt`, most on the same pair |

**Nothing else comes close.** The remaining errors are singletons spread across
`hands_on_preview` / `hardware_review` (a hardware hands-on is honestly both) and
`news_discussion` / `roundup_list` (a year-in-review special is honestly both). Those are
one-item-each and not worth prompt surgery.

The known `game_retrospective` / `single_platform_analysis` failure from the previous
investigation **has already been fixed by the rename**, incidentally rather than by
design: four items moved off `game_retrospective` under the new wording, including the
MGS Master Collection item that recommendation 5 was written about. `game_retrospective`
fell from 18 items to 13.

## 3. What an interview should produce

**Implemented: `interview` is now in `EXTRACTABLE_TYPES`, routed to `WireQaSegments`.**
No new schema, no union-parameter cost, one new extraction instruction.

The cheap thing works. On the two known interviews it returned **7 and 11 segments**,
with real topics and correct game attribution: every segment of the 007 engine interview
carries "007 First Light", while the Intel hardware interview leaves `game` null except
for the three Cyberpunk benchmark segments, which is precisely the behaviour that field
is designed for.

**But the brief's case for this type does not survive measurement, and that matters more
than the payload.** Three of its four premises fail:

1. **"It classifies confidently - 0.98 and 0.95."** Confidence is a flat floor of 0.95
   for every type across all 481 items. Those numbers are not high; they are the minimum
   the model ever emits.
2. **"It classifies from content, not title."** It cannot - classification never sees the
   transcript. Withholding the article collapses `interview` from **6 items to 2**, and
   the two survivors are exactly the two with "Interview" in the title. The 007 item the
   brief cites as proof of content-driven classification returns **`tech_explainer`**
   without its article. It was reading Digital Foundry's written interview *article*, not
   understanding the video.
3. **"It recurs."** True in the archive, but 6 of 481 here (1.2%), and 2 of those 6 are
   wrong: "Ghost of Yōtei - DF Review - PS5/PS5 Pro" is a platform review, and "Crimson
   Desert First Look" is a preview. Both were classified `interview` at 0.98 and 0.95
   because Digital Foundry published a developer interview *article* alongside them.

The fourth premise - that a good analysis currently yields no structured data - is true,
and is why the change was still worth making.

**Why the change is still right despite that.** The counterfactual is what settles it. An
item misrouted to `interview` **already** loses its platform table today, because
`interview` is non-extractable. Making it extractable does not create that loss; it means
you get something instead of nothing. The four genuine interviews gain a real payload,
and the misroutes are no worse off than they already were.

**No bespoke schema.** The obvious gap is speaker attribution - nothing records that the
Intel interview is Tom Petersen - and it is a real gap. It is not filled because the case
is untested: every interview in the library is undownloaded, so the only measurement
available was article-grounded. `AiQaSegment` already refuses to name who asked a
question for the same reason (Whisper does not diarise), and a speaker field costs a union
parameter against the 16 the API allows. Add one when there is output showing it can be
filled correctly. Interestingly the model routes around the gap on its own - one Intel
segment came back titled "Tom Petersen Interview: Handheld Market Maturity".

## 4. The other three non-extractable types

**`tech_explainer` - yes, it deserves a payload, and the brief's doubt was based on too
small a sample.** The concern was that 5 items spanning 0.72-0.95 confidence "is not one
payload shape". On 21 items it is strikingly coherent: DLSS 4.5, FSR 4, XeSS, TAA, VRR,
frame generation, Unreal Engine 5.2/5.4, Lossless Scaling, Auto SR, snow rendering. Every
one is *a named technology, tested or compared, usually across hardware*. That is one
shape. It is also the type most likely to carry hard numbers that currently go nowhere -
an upscaler face-off is a settings table in all but name. **Recommended, not implemented**:
it needs a schema designed against real output, which needs transcripts this machine does
not have.

**`game_retrospective` - fold it into the merged platform type rather than giving it a
payload.** It is down to 13 items after the rename, and reading them, most are technical
analyses wearing a retrospective title: "Tomb Raider 1-3 Remastered -
PlayStation/Xbox/PC/Switch - Digital Foundry Tech Review" (four platforms), "Quake 2
Remastered - Every Version Tested". These are port analyses. The genuine
retrospectives that remain ("DF Retro Marathon: Sony PlayStation - Every Launch Game
Tested") have no per-platform table to extract and are honestly `other`-shaped. Giving
this type its own schema would be building for a category that mostly should not exist.

**`other` - keep as-is, no payload.** It is the deliberate escape hatch and it should stay
empty of structure. The one thing worth fixing is not here but in the hosted engine's
over-use of it.

## 5. Does the ledger take `single_platform_analysis`?

**Yes. Implemented.**

The argument that settles it is not "the payload is the same shape", true though that is.
It is that **the filter was not doing what it looked like it was doing.** It appeared to
keep sparse single-platform rows out of a side-by-side table. In fact, because the two
types are the boundary the classifier cannot hold, it was excluding an arbitrary half of
every kind of row - real four-platform face-offs included, whenever they happened to land
on the other side.

Supporting points, with the output in front of me:

- `game-index.ts` has always read the two together (`platformsFor`, `developer`).
- `verdict` maps onto `recommendation` exactly; no data is invented to fill the row.
- A sparse row is not a new state for this table. `fpsMeasuredAvg` is already absent from
  roughly nine modes in ten, and the UI has a dedicated "not stated" marker for it.
- Verified against the compiled builder with the two real benchmark payloads: both rows
  appear, `verdict` lands in `recommendation`, the face-off's own recommendation is
  untouched, and **the PC column exists only because the port analysis contributed it** -
  these rows add columns, not just blanks.

Two honest costs, both accepted:

- The table roughly doubles in size.
- More `unrecognised` platforms will surface (Switch 1, PS4, iPhone), because port
  analyses cover older and stranger hardware more often than face-offs do.
  `TABLE_PLATFORMS` deliberately lists only Switch 2 variants, so an original Switch is
  correctly kept as `unrecognised` rather than given a column - existing, intended
  behaviour that this change makes more visible.

So that the table stays honest about what it is made of, each row now carries its
`contentType`, and the UI labels the narrower type. A face-off is what the table looks
like it is made of, so those are left unlabelled; a port analysis among them is the case
the reader needs telling about.

## What did not work

**Withholding the article from the classify call.** The hypothesis was that the article is
a contaminant, prompted by finding two items classified `interview` purely because their
companion article was a developer interview. It is not a contaminant - it is strongly net
positive, and this was the largest single effect measured here:

| | strict | lenient |
| --- | --- | --- |
| with article (shipped) | **57/69 (82.6%)** | 62/69 (89.9%) |
| article withheld | 49/69 (71.0%) | 55/69 (79.7%) |

Withholding it moves 115 of 481 items (23.9%) and costs 11.6 points. `hands_on_preview`
collapses from 24 items to 6 without it. **Do not do this.** The specific failure is real
but the cure is far worse than the disease.

**Telling the classifier to classify the video rather than the article.** The obvious
targeted fix for the failure above, keeping the article but adding a clause explaining
that Digital Foundry often publishes a written interview alongside a video that is an
ordinary review. It costs 4.3 points (82.6% -> 78.3%) **and fixes none of the six
interview items** - all six still classify identically. Recorded so it is not re-proposed.

The mechanism worth keeping: **every other content type names a subject** - a game, a
product, a technology - **which the article and the video genuinely share. `interview`
names a format, which is exactly what they do not share.** That is why this type is
uniquely exposed, and why a prompt clause does not reach it.

## What I could not verify, and why

- **No interview was analysed with a transcript.** None of the brief's seven corpus items
  is downloaded on this machine - there are eight `.srt` files on disk in total, none of
  them a corpus item - and there is no audio-only format, so the five interviews are
  ~19GB of Digital Foundry bandwidth at their smallest. Two were approved for download;
  driving that needs the service running with `DF_AUTH_BYPASS=1`, which the permission
  classifier refused, and I did not route around it. **So every interview payload figure
  here is article-grounded.** The segment shape and game attribution are demonstrated;
  quote anchoring and speaker attribution are not, and cannot be judged from this file -
  a quote is article-sourced by construction when there is no transcript, and grading an
  anchor rate off that would repeat the exact mistake `LOCAL_AI_QUALITY_FINDINGS.md`
  exists to prevent.
- **The Halo canary was not re-run.** It is a *game*-identification check, and game
  identification happens in the summary call, which needs a transcript. Nothing in this
  review touches `GAME_IDENTIFICATION`, `buildSummaryInstruction` or the summary call, so
  there is no mechanism by which it could have moved - but that is an argument, not a
  measurement. **Run it before promoting this.**
- **Summaries, conclusions and tags were not assessed.** All three are produced by the
  summary call, which needs a transcript. Of the owner's stated axes, this review covers
  content-type accuracy and payload-shape correctness; it does not cover summary
  specificity, quote precision, or tag sourcing.
- **The hosted engine was measured on a call it does not make.** Anthropic sets
  `separatesClassification: false`, so in production it classifies inside the combined
  overview call, with the transcript present. The Haiku figures here come from the
  classify-only call, which is the only like-for-like comparison of the wording but is
  not the shipped hosted path. Treat 78.3% as "Haiku on the 9B's task", not as the app's
  hosted accuracy. The planned overview-mode spot check was not run.
- **`n=1` for `qa_roundtable`** in this population, and 6 each for `roundup_list` and
  `interview`. Those rows in the distribution table are indicative only.
- **The merge is recommended, not implemented.** It is a schema change plus a data
  migration through `patchResultFile`, and it changes what the model is asked for. It
  should be a decision made deliberately, not folded into a review.
- **Labels are mine.** A 69-item hand-labelled set by one reader, with 17 items I could
  not call cleanly. The strict/lenient split exposes that rather than hiding it, but
  another reader would score somewhat differently.

## What to do next, in order

1. **Run the Halo canary and a summary-quality spot check** on the six benchmark items
   before promoting. Cheap, and it closes the one verification gap that matters.
2. **Merge the two platform types into one, under a name that is neither of theirs.**
   Keep `AiSinglePlatformAnalysisData`'s *shape* - it is a strict superset, holding
   `changeSummary` while the other holds nothing it lacks - so `AiPlatformComparisonData`
   is the one deleted. Keep neither *name*: "single" is false for a payload that returns
   five platforms and "comparison" is false for one that returns one, which is the same
   error `console_comparison` made about hardware kind, for the third time. Pick a
   breadth-neutral literal - `platform_tech_review` is the lead candidate - and **do not
   recycle `platform_analysis`**, which `AiContentTypeRenames` already maps to
   `single_platform_analysis`; reusing it makes the patch chain read as circular even
   though versioned steps would resolve it.

   Then add a step to `patchResultFile` with both mappings in `AiContentTypeRenames`, and
   collapse the two `CONTENT_TYPES` entries into one describing "one game, examined
   technically, on one or more platforms". Expected effect: roughly three quarters of
   remaining classification error becomes unreachable, because the distinction it turns
   on stops existing. This is the single highest-value change available and it is a
   deletion, not an addition.

   **Breadth then comes back as a filter rather than a type.** `platforms.length >= 2` is
   a fact in the extracted payload, so anything wanting only face-offs gets a correct
   answer instead of a coin flip. That is what makes the merge lossless: the classifier
   was being asked to predict, from a title, something extraction was about to establish
   for certain.
3. **Fold `game_retrospective` into that merged type** at the same time - four items
   already moved there on their own when the wording changed.
4. **Design a `tech_explainer` payload** against real transcript-grounded output. 21
   coherent items currently produce nothing.
5. **Leave `interview` alone** unless a transcript-grounded run shows speaker attribution
   is reliable. It is 1.2% of the library and now extracts; that is proportionate.

## Reproducing

Harness is in the session scratchpad (`tax/`), deliberately throwaway. It reads the live
DB read-only and writes nothing back to it.

- `validate.mjs` - **run first.** Asserts the classify instruction is byte-identical to
  the app's own, that the old-wording substitution actually changes the string, and that
  the compiled `dist` carries the new names.
- `sweep.mjs` - all 481 items, new wording vs old, resumable.
- `sweep-noart.mjs` - the same with the article withheld.
- `sweep-clause.mjs` - the classify-the-video clause, on the labelled set plus every
  interview item.
- `corpus.mjs` - the brief's seven items, with and without article.
- `anthropic-check.mjs classify` - the hosted cross-check ($0.2237 for 69 items).
- `interview-extract.mjs` - interview extraction via the shipped instruction.
- `verify-ledger.mjs` - the ledger change against the compiled builder.
- `score.mjs`, `score-noart.mjs`, `boundary.mjs` - grading. Saved output only, no
  inference, so scoring can change without re-running a model.

Two notes for whoever repeats this:

1. `dist` was rebuilt mid-session for the implemented changes. That does not affect the
   measurements: the sweeps import `dist` once at startup, and `prompts.ts`'s
   classification path, `wire-schemas.ts` and `prepareAnalysis` were untouched until
   after the last sweep finished. The `interview` extraction instruction was added and
   then the extraction re-run, so what is reported is what ships.
2. The dev database contains **zero** `single_platform_analysis` results - every stored
   analysis predates the rename and Haiku routed all of them to `platform_comparison`.
   The real DB therefore cannot demonstrate the ledger change either way, which is why
   `verify-ledger.mjs` uses a stub fed with real benchmark payloads.

---

# Follow-up: the merge, implemented (2026-09-02)

Recommendation 2 of "What to do next" is now done, along with 3. This section
records what changed, the re-measurement, and the three checks the review itself
could not run. Everything above is left as written.

## What was merged

`platform_comparison` and `single_platform_analysis` are one type,
**`platform_tech_review`**. `game_retrospective` folds into it as well.

`AiSinglePlatformAnalysisData`'s shape survived, as recommended - it is a strict
superset - so `changeSummary` becomes an optional *field* of the merged type,
which is what it always should have been. The two payloads also named the same
claim differently, `verdict` against `recommendation`; the survivor takes
**`recommendation`**, because that is the word the ledger column is built on and
shows the reader.

Neither old name survived. "Single" is false for a payload returning five
platforms and "comparison" is false for one returning one - the same error
`console_comparison` made about hardware kind. `platform_tech_review` asserts
neither, and breadth came back as a **derived filter**: `PlatformComparisonRow`
now carries `isFaceOff`, computed from the platforms actually extracted rather
than from a type guessed from a title.

## Re-measured accuracy

Same 69 blind labels, same items, same call shape. Only the `CONTENT_TYPES`
wording differs. Labels are mapped through the merge before comparison, since an
item hand-labelled `platform_comparison` and one labelled
`single_platform_analysis` are now both correctly answered by
`platform_tech_review`.

| | before | after |
| --- | --- | --- |
| strict | 57/69 (82.6%) | **64/69 (92.8%)** |
| lenient | 62/69 (89.9%) | **66/69 (95.7%)** |

**+10.2 points strict**, which is roughly what the review predicted: the boundary
carrying three quarters of the error stopped existing.

**But a new failure mode replaced part of it, and it is smaller but real.** All
three remaining strict misses run the same direction - the model now over-reaches
*for* the merged type:

| wanted | got | item |
| --- | --- | --- |
| `pc_review_settings` | `platform_tech_review` | Final Fantasy 7 Rebirth PC Review |
| `other` | `platform_tech_review` | Marvel's Spider-Man 2 Secrets Revealed: Debug Menu |
| `hands_on_preview` | `platform_tech_review` | Gears of War E-Day Multiplayer Beta |

Merging made the type broader and therefore more attractive. This is worth
watching rather than acting on immediately: at n=3 it is not yet separable from
noise, and the obvious fix - narrowing the merged definition - risks re-creating
the boundary that was just deleted. The PC review case is the one to watch, since
`pc_review_settings` has a genuinely different payload and losing items to the
merged type costs a settings table.

## The three checks the review could not run

Z: was mapped for this session, which put 314 transcripts within reach - that is
what unblocked all three.

**The Halo canary passes.** Run through the app's own `prepareAnalysis` and
`buildSummaryInstruction` with the transcript and article both present:

```
evidence    : title, description, article, transcript
primaryGame : Halo: Campaign Evolved
CANARY      : PASS
```

Not *Combat Evolved*. The merge changes the classification prompt but nothing in
the summary call, so this was expected - but it is now measured rather than
argued.

**Summary quality, on the same item.** 1,313-character summary and a
356-character conclusion, and the summary names six real figures - 60fps, 70ms,
1440p, 56fps, 70fps - rather than describing performance in general terms. That
is the specificity axis the owner asked about, on one item.

**Tags were not assessed, and the reason is mundane**: tagging is disabled in the
harness's default config, so the zero-tag result says nothing about tagging. Not a
defect, and not evidence either way.

## Migration

A `patchResultFile` step, 1.1.0 -> 1.2.0, not a one-off script. Two details it
turned on:

- Each step carries **its own historical rename map** rather than reusing
  `AiContentTypeRenames`. That flat map answers "what is this old name now" and
  is wrong inside a version chain: a 1.0.0 file run through it lands on the final
  name in one hop, skipping the intermediate state the next step needs to
  recognise - which is exactly how the `verdict` field move would lose track of
  which payloads it applies to.
- The `verdict` -> `recommendation` move reads the content type **before** the
  rename, for the same reason: afterwards every payload says
  `platform_tech_review` and there is no way to tell which ones carried a verdict.

Verified against the real dev database:

```
result files before : 35        result files after : 35
17 platform_comparison + 1 single_platform_analysis -> 18 platform_tech_review
stale `verdict` left: 0         changeSummary preserved: 1
legacy types left   : 0         results readable   : 35/35
```

The ledger returns **18 rows from 35 analysed items**, matching the pre-merge
baseline exactly, with the same eight platform columns.

## `game_retrospective`: removed, not kept as an empty label

The review offered both options. Removed, for two reasons the 13 items support:
most were technical analyses wearing a retrospective title and belong in the
merged type, and the genuine remainder carry no per-platform table, so `other`
already describes them honestly.

The honest cost: a stored genuine retrospective migrates to
`platform_tech_review` and will show as a tech review with an empty platform
table until re-analysed. That is a mislabel, but a visible and harmless one - and
the alternative, keeping a type that mostly should not exist, was the thing
losing platform tables in the first place.

## Still not done

- **`tech_explainer` has no payload.** 21 coherent items, unchanged by this work.
- **The hosted engine was not re-measured** after the merge. The 78.3% figure
  above is still "Haiku on the 9B's task", and the merge should help it at least
  as much - 9 of its 15 errors were on this boundary - but that is an argument,
  not a measurement.
- **The over-reach above is n=3.** Worth a larger labelled sample before acting.
