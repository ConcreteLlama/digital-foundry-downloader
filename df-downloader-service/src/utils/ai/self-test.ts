import { AiSelfTestCheck, AiSelfTestResponse, logger } from "df-downloader-common";
import { AiAnalysisConfig } from "df-downloader-common/config/ai-analysis-config.js";
import { z } from "zod";
import { localComputeGate } from "../local-compute-gate.js";
import { makeProvider } from "./providers/resolve.js";
import { WireContentType } from "./wire-schemas.js";

/**
 * A transcript with a known right answer, written for this test.
 *
 * Invented rather than taken from a real video, and deliberately so. The
 * failure this exists to catch produces a well-formed answer that is simply
 * wrong, so the test needs a question whose answer can be checked - and a real
 * transcript's classification is a judgement call, which is not something to
 * assert a pass or fail against.
 *
 * "Ashenfall" is not a real game, so it appears in no training set. That is
 * what makes the grounding check below mean something: a model that echoes the
 * name read what it was handed, and one that names a different game did not.
 *
 * Long on purpose, and that is the whole point of it.
 *
 * It was short at first, which made the test worse than useless: it passed
 * while every real analysis on the same machine failed. On an Intel iGPU over
 * Vulkan the corruption is prompt-size dependent - measured on an N305, a
 * 148-token prompt classified correctly and a 584-token one came back as
 * "interview" with a confidence of "-1111111111111111E-1111111111111111".
 * A fixture below that threshold reports a broken engine as healthy, which is
 * the one result a health check must never produce.
 *
 * So this sits well above it, at roughly a thousand prompt tokens - still far
 * shorter than a real transcript, but past the point where a failing engine
 * actually fails. It costs prompt-processing time on a slow machine, which is
 * the right trade for an answer that means something.
 */
const FIXTURE_TRANSCRIPT = [
  "Welcome back. We have had Ashenfall on both consoles for about a week now, and this is the full technical breakdown of how the two versions compare.",
  "Starting with the stronger machine. Performance mode targets 60 frames per second at a dynamic 1440p, and for the most part it holds that.",
  "Our capture across the opening six hours shows a locked 60 through the forest regions and the underground sections, with one consistent exception.",
  "In the market square during heavy rain we measured a sustained drop to 48fps, and it happens every time you walk through it at that time of day.",
  "That is a weather and alpha effects cost rather than a geometry one, because the same square in clear weather holds its target without trouble.",
  "Quality mode on the same machine locks to 30fps at native 4K, with ray traced reflections enabled on water and on the polished interior floors.",
  "That mode is rock solid. Across our entire capture we did not record a single dropped frame, and the frame pacing is even throughout.",
  "The weaker console is the more interesting case, and the one most people will be asking about, so we spent longer with it.",
  "It runs the same 60fps target in performance mode, but the internal resolution drops to 1080p and the reconstruction is noticeably softer in motion.",
  "The reflections are screen space only. Standing at the harbour, the boats and the far buildings simply do not appear in the water at all.",
  "Frame pacing is the real problem here. In the opening chapter we see a repeating judder that our frame time graph puts at an uneven delivery pattern.",
  "It settles down once you are out of the tutorial area, which suggests a streaming cost rather than a raw rendering one, but the first hour is rough.",
  "Load times came in at 4 seconds on the stronger console against 7 seconds on the weaker one, measured from menu selection to player control.",
  "Both are a substantial improvement on the previous generation, where the same publisher was asking for the better part of a minute.",
  "Image quality in still shots is closer than the resolution numbers suggest, and if you are playing on a smaller screen you may not notice the gap.",
  "In motion it is a different story, and the softness on the weaker machine is obvious once you know to look for it.",
  "So which version should you buy? If you want the smoothest experience, performance mode on the stronger machine is the one to pick.",
  "If you only own the weaker console, the game is still perfectly playable, but go in knowing the opening hour is the worst it will look.",
].join(" ");

/**
 * Every classification that means the model understood the fixture.
 *
 * A set rather than one expected answer, and calibrated against a healthy
 * engine rather than against what the fixture "obviously" is. Measured on a
 * working RTX 5080 CUDA build of the 9B, this transcript classifies as
 * "tech_explainer" every time, including with the wording sharpened to lean
 * on the comparison. Asserting "platform_tech_review" would therefore have
 * failed a perfectly good engine on every run, which is the worst thing a
 * health check can do.
 *
 * What the check still catches is the type of answer seen in the wild from a
 * broken backend: "interview", on a transcript that is one presenter reading
 * frame rates. Everything left out of this set is that kind of wrong.
 */
const REASONABLE_TYPES = new Set([
  "platform_tech_review",
  "tech_explainer",
  "hardware_review",
  "hands_on_preview",
  "pc_review_settings",
]);

/** Details only present in the fixture, so repeating one proves it was read. */
const GROUNDING_TERMS = ["ashenfall", "1440p", "1080p", "60", "30", "4k", "48"];

/**
 * Deliberately smaller than the real analysis schema.
 *
 * The real one asks for tags, games, a conclusion and a structured extraction,
 * which on a slow box is minutes of work to answer a question that a
 * classification and a couple of sentences already answer. This keeps the two
 * parts that matter - a grammar-constrained enum and free prose - because
 * those are exactly where degenerate output showed itself.
 */
const SelfTestAnswer = z.object({
  contentType: WireContentType,
  /*
   * Deliberately unbounded, unlike the real analysis schema.
   *
   * A broken backend emitted "1111111111111111E1111111111111111" here, which
   * JSON.parse turns into Infinity. Range-checking it would fail the parse and
   * report "the model did not answer", when in fact it answered and the answer
   * is itself the most damning evidence available. This test exists to explain
   * what went wrong, so it has to accept the broken answer in order to say so -
   * see the sanity check below. The real schema keeps its bounds.
   */
  contentTypeConfidence: z.number(),
  summary: z.string(),
});

const check = (name: string, state: AiSelfTestCheck["state"], detail: string): AiSelfTestCheck => ({
  name,
  state,
  detail,
});

/**
 * Text that is not really text, which is what a broken backend produces.
 *
 * Two failure shapes, and the first one was found the hard way. A word-ratio
 * check alone missed the real thing: the observed Vulkan output was
 * `( ( ( ( ( (` repeated to the token limit, which contains no words at all,
 * so a words-based measure found nothing to judge and reported it fine. The
 * check that exists to catch degenerate output has to catch the degenerate
 * output that actually happened.
 *
 * So the letter count comes first - prose about frame rates and resolutions
 * has letters in it, and a wall of punctuation does not - and the
 * distinct-word ratio then covers the other shape, a real phrase repeated
 * over and over. The ratio is the same measure used on Whisper transcripts,
 * for the same reason.
 */
export const looksDegenerate = (text: string): string | undefined => {
  const letters = text.match(/[a-zA-Z]/g)?.length ?? 0;
  if (letters < 20) {
    return `it contains almost no readable text (${letters} letters in ${text.length} characters)`;
  }
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  // Below this the ratio says more about English than about the model - a
  // short correct sentence repeats "the" and "at" quite legitimately.
  if (words.length < 12) {
    return undefined;
  }
  const distinct = new Set(words).size / words.length;
  return distinct < 0.35
    ? `only ${Math.round(distinct * 100)}% of its words are distinct, so it is repeating itself`
    : undefined;
};

/**
 * Runs one real analysis against a known fixture and reports what happened.
 *
 * Exists because "the server answered" and "the engine works" turned out to be
 * different claims. A GPU build with broken kernels for this model's recurrent
 * layers returned perfectly valid JSON - the grammar guarantees that much -
 * saying an obvious tech review was an interview, with a confidence of 1.
 * Every check short of reading the answer passed it, including the existing
 * connection test.
 *
 * So this asks something with a known answer and then checks the answer, which
 * is the only thing that separates the two.
 */
export const runLocalAnalysisSelfTest = async (config: AiAnalysisConfig): Promise<AiSelfTestResponse> => {
  const checks: AiSelfTestCheck[] = [];

  /*
   * Refused rather than queued when the machine is busy.
   *
   * Analysis takes the machine exclusively, so waiting for it would mean an
   * HTTP request hanging for however long a backfill item takes - which the
   * settings form would show as a test that never finishes. Being told to come
   * back is a better answer than a spinner.
   */
  const gate = localComputeGate.getStatus();
  if (gate.analysisHoldingMachine || gate.transcriptionsRunning > 0) {
    return {
      ok: false,
      summary: "The machine is busy",
      checks: [
        check(
          "Machine free",
          "fail",
          gate.analysisHoldingMachine
            ? "An analysis is running and has the machine to itself. Try again once it has finished."
            : `${gate.transcriptionsRunning} transcription(s) are running. Try again once they have finished.`
        ),
      ],
    };
  }

  let provider;
  try {
    provider = makeProvider(config, "local");
  } catch (e) {
    return {
      ok: false,
      summary: "Local analysis is not set up",
      checks: [check("Configuration", "fail", e instanceof Error ? e.message : String(e))],
    };
  }

  const startedAt = Date.now();
  let answer: z.infer<typeof SelfTestAnswer>;
  let outputTokens = 0;
  try {
    const result = await provider.callStructured(
      SelfTestAnswer,
      "You are analysing a video transcript for a media library.",
      `Transcript:\n${FIXTURE_TRANSCRIPT}`,
      "Classify this video as one of the given types, and write a two-sentence summary naming the specific numbers and platforms it gives."
    );
    answer = result.parsed;
    outputTokens = result.usage.outputTokens ?? 0;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.log("warn", `Local analysis self-test could not get an answer: ${message}`);
    /*
     * A number the JSON parser could not keep is a diagnosis, not a parse error.
     *
     * Observed verbatim from the Vulkan backend: a confidence of
     * "1111111111111111E1111111111111111", which becomes Infinity and which
     * Zod then rejects. Left alone, the person sees a schema validation dump
     * and concludes the test is broken - when in fact the test has just found
     * exactly what it was built to find, and the answer is unambiguous.
     */
    if (/Infinity|NaN/.test(message)) {
      return {
        ok: false,
        summary: "Not working properly",
        checks: [
          check("Model answered", "pass", "It answered, but see below."),
          check(
            "Sane numbers",
            "fail",
            "It returned a number no working model produces - too large for the JSON parser to hold. The compute backend is generating corrupt output. If this ran on a GPU, turn the GPU off for local analysis and test again."
          ),
        ],
      };
    }
    return {
      ok: false,
      summary: "The model could not be reached",
      checks: [check("Model answered", "fail", message)],
    };
  }
  const elapsedMs = Date.now() - startedAt;

  /*
   * Reported first, and as information rather than a verdict: which device it
   * ran on is the thing most people press this button to find out, and it is
   * worth knowing whether the run passed or failed. There is no correct
   * answer to assert - CPU is a legitimate choice, and on this model it is
   * currently the reliable one.
   */
  const backend = provider.describeBackend?.();
  checks.push(
    check("Running on", "info", backend ?? "Not known - the model server did not say which device it chose.")
  );

  checks.push(check("Model answered", "pass", `Valid structured output in ${Math.round(elapsedMs / 1000)}s.`));

  if (outputTokens > 0 && elapsedMs > 0) {
    const perSecond = outputTokens / (elapsedMs / 1000);
    checks.push(
      check(
        "Speed",
        "info",
        // Inverted below one per second, because "0.1 tokens per second" is a
        // number people have to do arithmetic on to understand, and "10s per
        // token" is the same fact already understood.
        `${outputTokens} tokens, ${
          perSecond >= 1 ? `${perSecond.toFixed(1)} per second` : `about ${(1 / perSecond).toFixed(0)}s per token`
        }.`
      )
    );
  }

  /*
   * The check the whole feature exists for.
   *
   * A wrong answer here is not a matter of taste - the fixture is a console
   * comparison full of frame rates and resolutions. Getting it wrong while
   * reporting high confidence is the exact signature of a compute backend
   * producing nonsense, because the grammar keeps the shape valid no matter
   * how meaningless the content behind it is.
   */
  if (REASONABLE_TYPES.has(answer.contentType)) {
    checks.push(
      check("Understood the transcript", "pass", `Filed a console comparison as "${answer.contentType}", which is right.`)
    );
  } else {
    checks.push(
      check(
        "Understood the transcript",
        "fail",
        `Called an obvious console comparison "${answer.contentType}", with a confidence of ${answer.contentTypeConfidence}. The answer is well-formed but wrong, which is what a broken compute backend looks like - if this ran on a GPU, try turning that off for local analysis and running the test again.`
      )
    );
  }

  /*
   * A confidence outside 0-1 is proof on its own.
   *
   * No working model emits it - it is not a judgement that came out wrong, it
   * is a number that could not have been produced by a sane decode. Observed
   * verbatim as "1111111111111111E1111111111111111" from the Vulkan backend.
   */
  if (!Number.isFinite(answer.contentTypeConfidence) || answer.contentTypeConfidence < 0 || answer.contentTypeConfidence > 1) {
    checks.push(
      check(
        "Sane numbers",
        "fail",
        `It reported a confidence of ${answer.contentTypeConfidence}, which is not a value a working model produces. The compute backend is returning corrupt output.`
      )
    );
  }

  const summary = answer.summary?.trim() ?? "";
  if (!summary) {
    checks.push(check("Wrote a summary", "fail", "It returned an empty summary, so analyses would be stored blank."));
  } else {
    const degenerate = looksDegenerate(summary);
    if (degenerate) {
      checks.push(check("Wrote a summary", "fail", `The summary is broken: ${degenerate}.`));
    } else {
      const grounded = GROUNDING_TERMS.some((term) => summary.toLowerCase().includes(term));
      checks.push(
        grounded
          ? check("Wrote a summary", "pass", "It wrote a summary using details that only appear in the transcript.")
          : check(
              "Wrote a summary",
              "warn",
              "It wrote a summary, but none of the transcript's own names or numbers appear in it - so it may not be reading what it was given closely."
            )
      );
    }
  }

  const failed = checks.filter(({ state }) => state === "fail").length;
  const warned = checks.filter(({ state }) => state === "warn").length;
  const ok = failed === 0;
  logger.log(
    ok ? "info" : "warn",
    `Local analysis self-test: ${
      ok ? "working" : `${failed} check(s) failed`
    }, classified the fixture as ${answer.contentType} in ${Math.round(elapsedMs / 1000)}s`
  );
  return {
    ok,
    summary: ok ? (warned ? "Working, with something worth a look" : "Working") : "Not working properly",
    checks,
    // Returned even on a pass. The failure this catches produces a plausible
    // sentence, and no summarising substitutes for reading what came back.
    output: summary || undefined,
  };
};
