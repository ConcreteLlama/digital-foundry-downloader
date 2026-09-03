import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Alert,
  Box,
  Chip,
  Collapse,
  Divider,
  FormHelperText,
  Link as MuiLink,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ScheduledBackfillStatus,
  ScheduledBackfillWindowRecord,
  cronToSimpleSchedule,
  formatDurationMs,
  simpleScheduleToCron,
  validateCronExpression,
} from "df-downloader-common";
import {
  AiAnalysisConfig,
  AiAnalysisConfigUtils,
  AiProviderId,
  DEFAULT_SCHEDULED_BACKFILL_CRON,
  DEFAULT_SCHEDULED_BACKFILL_END_TIME,
  ScheduledBackfillConfig,
  ScheduledBackfillEligibilityConfig,
} from "df-downloader-common/config/ai-analysis-config";
import cronstrue from "cronstrue";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Link } from "react-router-dom";
import { previewScheduledBackfill } from "../../api/ai-analysis";
import { ZodDurationField } from "../zod-fields/zod-duration-field.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const ScheduledBackfillSettingsForm = () => (
  <DfSettingsSectionForm sectionName="aiAnalysis" title="Scheduled backfill">
    <ScheduledBackfillSettings />
  </DfSettingsSectionForm>
);

/**
 * What the form holds before anything has been set.
 *
 * The config key is optional so existing installs need no migration, which
 * means the panel has to render something before the object exists. These are
 * the schema's own defaults, restated rather than parsed out of it because
 * reading defaults back off a zod object is more indirection than three
 * literals are worth.
 */
const EMPTY_SCHEDULE: ScheduledBackfillConfig = {
  enabled: false,
  schedule: DEFAULT_SCHEDULED_BACKFILL_CRON,
  endTime: DEFAULT_SCHEDULED_BACKFILL_END_TIME,
  eligibility: { requireSubtitles: true, requireArticle: true },
};

/**
 * Fills in whatever the form is missing.
 *
 * `?? EMPTY_SCHEDULE` is not enough, and the difference is the whole bug this
 * replaced. The maxPerWindow field registers the nested path
 * `scheduledBackfill.maxPerWindow`, which materialises `scheduledBackfill` as an
 * object holding only that key - so it is *partial*, not absent, and a nullish
 * fallback never fires. patch() then spread that partial into the saved value
 * and the render read `.endTime.split()` and `.eligibility.articleGrace` off it,
 * taking the whole panel down on the first edit while first load looked fine.
 *
 * Merging rather than defaulting is correct whatever react-hook-form decides to
 * materialise, which is not something this component should have to predict.
 */
const withDefaults = (raw?: Partial<ScheduledBackfillConfig>): ScheduledBackfillConfig => ({
  ...EMPTY_SCHEDULE,
  ...(raw ?? {}),
  eligibility: { ...EMPTY_SCHEDULE.eligibility, ...(raw?.eligibility ?? {}) },
});

/**
 * What the grace period starts at when someone switches it on.
 *
 * Three days rather than a fortnight: an article usually lands within a day or
 * two of the video or not at all, so a long default mostly means waiting on
 * something that was never coming. Easy to raise, and the field says what it
 * means.
 */
const DEFAULT_ARTICLE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Monday first, which is how the mock-ups read and how a week is usually written here. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const PROVIDER_LABELS: Record<AiProviderId, string> = {
  anthropic: "Claude",
  local: "On this machine",
};

const two = (value: number) => String(value).padStart(2, "0");

/** "00:00" for the time inputs, from the cron expression's hour and minute. */
const startTimeOf = (schedule: string): string | undefined => {
  const simple = cronToSimpleSchedule(schedule);
  return simple ? `${two(simple.hour)}:${two(simple.minute)}` : undefined;
};

/**
 * "5 hours" or "4 hours, ends next day".
 *
 * Derived rather than typed, which is what settles the midnight problem: the
 * reader states the two times they actually care about and is told what that
 * means, instead of doing the arithmetic or learning a sentinel value.
 */
const describeLength = (startTime: string, endTime: string): string | undefined => {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some((part) => !Number.isFinite(part))) {
    return undefined;
  }
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  // Equal means a full day rather than nothing - see closeFor() service-side,
  // which resolves it the same way. The two must agree or the derived line
  // describes a window the feeder does not run.
  const spanMinutes = endMinutes > startMinutes ? endMinutes - startMinutes : endMinutes - startMinutes + 1440;
  const nextDay = endMinutes <= startMinutes;
  const length = formatDurationMs(spanMinutes * 60_000)
    .replace(/(\d+)h/, (_, hours) => `${hours} hour${hours === "1" ? "" : "s"}`)
    .replace(/(\d+)m/, (_, minutes) => `${minutes} minute${minutes === "1" ? "" : "s"}`)
    .replace(" ", " ");
  return nextDay ? `${length}, ends next day` : length;
};

const timeOfDay = (date: Date) => `${two(date.getHours())}:${two(date.getMinutes())}`;

/**
 * "tonight at 00:00", "tomorrow at 02:00", "on Monday at 02:00".
 *
 * Relative wording for the next day or two because that is how a nightly
 * window is thought about, and an absolute date beyond that because "in four
 * days at 02:00" is harder to check than the date is.
 */
const describeWhen = (when: Date, now: Date): string => {
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayGap = Math.round((startOfDay(when) - startOfDay(now)) / 86_400_000);
  const at = timeOfDay(when);
  if (dayGap <= 0) {
    // "tonight" only if it really is later today; something earlier today is
    // the current window's own opening, which reads as "today".
    return when.getTime() >= now.getTime() && when.getHours() >= 18 ? `tonight at ${at}` : `today at ${at}`;
  }
  if (dayGap === 1) {
    return `tomorrow at ${at}`;
  }
  if (dayGap < 7) {
    return `on ${DAY_NAMES[when.getDay()]} at ${at}`;
  }
  return `on ${when.toLocaleDateString()} at ${at}`;
};

const ScheduledBackfillSettings = () => {
  const { control, setValue, getValues } = useFormContext<AiAnalysisConfig>();
  /*
   * The whole section is watched rather than individual fields: the blocked
   * state depends on `enabled`, `apiKey` and `local.enabled` together, and
   * those are edited on the AI Analysis page - so what matters here is the
   * combination, evaluated live against the same helper the rest of the app
   * uses rather than a second opinion about what counts as configured.
   */
  const values = useWatch({ control }) as Partial<AiAnalysisConfig>;
  const usableProviders = AiAnalysisConfigUtils.usableProviders(values as AiAnalysisConfig);
  const schedule = withDefaults(values.scheduledBackfill as Partial<ScheduledBackfillConfig> | undefined);

  /**
   * Writes the whole object, so the optional config key is never left
   * half-built.
   *
   * Reads the current value through getValues() rather than from the rendered
   * `schedule` above, which is a render-closure snapshot. React batches
   * updates, so two changes dispatched before the next render would both start
   * from the same stale object and the second would silently discard the
   * first - which is exactly what changing a start time and an end time in
   * quick succession does.
   */
  const patch = (changes: Partial<ScheduledBackfillConfig>) => {
    const current = withDefaults(getValues("scheduledBackfill") as Partial<ScheduledBackfillConfig> | undefined);
    setValue("scheduledBackfill", { ...current, ...changes }, { shouldDirty: true, shouldValidate: true });
  };

  const patchEligibility = (changes: Partial<ScheduledBackfillEligibilityConfig>) => {
    const current = withDefaults(getValues("scheduledBackfill") as Partial<ScheduledBackfillConfig> | undefined);
    patch({ eligibility: { ...current.eligibility, ...changes } });
  };

  if (usableProviders.length === 0) {
    return <NothingToSchedule reason={AiAnalysisConfigUtils.providerUnusableReason(values as AiAnalysisConfig, "anthropic")} />;
  }

  return (
    <Stack spacing={0}>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        Analyse your back catalogue automatically, during hours you choose.
      </Typography>

      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography>Run analysis on a schedule</Typography>
        <Switch checked={schedule.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />
      </Stack>

      {/*
        Dimmed rather than removed when the switch is off, so the shape of what
        you are turning on stays visible - the same reason the mock-ups show it
        greyed rather than hidden.
      */}
      <Box
        sx={{
          mt: 3,
          opacity: schedule.enabled ? 1 : 0.4,
          pointerEvents: schedule.enabled ? "auto" : "none",
        }}
        aria-disabled={!schedule.enabled}
      >
        <WindowControls schedule={schedule} patch={patch} />
        <EngineRow schedule={schedule} patch={patch} usableProviders={usableProviders} config={values as AiAnalysisConfig} />
        <EligibilityRows schedule={schedule} patchEligibility={patchEligibility} />
        <SchedulePreview schedule={schedule} enabled={schedule.enabled} />
        <AdvancedSchedule schedule={schedule} patch={patch} />
      </Box>
    </Stack>
  );
};

/**
 * The state nobody tests, and the one that matters most here.
 *
 * A schedule switched on with no engine behind it does nothing, silently, for
 * ever - and silently doing nothing is exactly what a working scheduled
 * feature looks like, so there is no moment at which the mistake announces
 * itself. The switch is made unavailable rather than hidden, so the feature
 * stays discoverable, and the message says both what is missing and where to
 * fix it.
 */
const NothingToSchedule = ({ reason }: { reason?: string }) => (
  <Stack spacing={2}>
    <Typography variant="body2" sx={{ color: "text.secondary" }}>
      Analyse your back catalogue automatically, during hours you choose.
    </Typography>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ opacity: 0.4 }}>
      <Typography>Run analysis on a schedule</Typography>
      <Switch disabled />
    </Stack>
    <Alert severity="warning" variant="outlined">
      <Typography variant="subtitle2">There's nothing to schedule yet</Typography>
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        {reason === "AI analysis is turned off"
          ? "AI analysis is turned off, so a schedule would have nothing to run."
          : "Analysis needs either an Anthropic API key or a model on this machine, and neither is set up."}{" "}
        <MuiLink component={Link} to="/settings/ai-analysis">
          Set one up in AI Analysis →
        </MuiLink>
      </Typography>
    </Alert>
  </Stack>
);

type PatchFn = (changes: Partial<ScheduledBackfillConfig>) => void;

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap spacing={1.5} sx={{ mb: 2 }}>
    <Typography variant="body2" sx={{ color: "text.secondary", minWidth: 96 }}>
      {label}
    </Typography>
    {children}
  </Stack>
);

const WindowControls = ({ schedule, patch }: { schedule: ScheduledBackfillConfig; patch: PatchFn }) => {
  const simple = cronToSimpleSchedule(schedule.schedule);
  const startTime = simple ? `${two(simple.hour)}:${two(simple.minute)}` : undefined;

  if (!simple || !startTime) {
    /*
     * The advanced field can express things these controls cannot - "only on
     * the 3rd of the month", a stepped hour field. Rather than render controls
     * that would silently rewrite it into something simpler on the next
     * keystroke, the controls step aside and say where the setting lives.
     */
    return (
      <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
        This schedule is more specific than the simple controls can show, so it is set under Advanced below.
      </Alert>
    );
  }

  const setStart = (next: string) => {
    const [hour, minute] = next.split(":").map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return;
    }
    patch({ schedule: simpleScheduleToCron({ hour, minute, days: simple.days }) });
  };

  const toggleDay = (day: number) => {
    const days = simple.days.includes(day) ? simple.days.filter((candidate) => candidate !== day) : [...simple.days, day];
    // Never all-off: a schedule with no days is a schedule that never runs,
    // which is the silent failure this whole panel exists to prevent.
    if (!days.length) {
      return;
    }
    patch({ schedule: simpleScheduleToCron({ hour: simple.hour, minute: simple.minute, days }) });
  };

  const everyDay = simple.days.length === 7;
  const length = describeLength(startTime, schedule.endTime);

  return (
    <Fragment>
      <Row label="Start at">
        <TextField
          type="time"
          size="small"
          value={startTime}
          onChange={(event) => setStart(event.target.value)}
          sx={{ width: 120 }}
          inputProps={{ "aria-label": "Window start time" }}
        />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          until
        </Typography>
        <TextField
          type="time"
          size="small"
          value={schedule.endTime}
          onChange={(event) => patch({ endTime: event.target.value })}
          sx={{ width: 120 }}
          inputProps={{ "aria-label": "Window end time" }}
        />
        {length && (
          <Typography variant="body2" sx={{ color: "text.disabled", fontFamily: "monospace" }}>
            — {length}
          </Typography>
        )}
      </Row>

      <Row label="On">
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {DAY_ORDER.map((day, index) => (
            <Tooltip key={`${day}-${index}`} title={DAY_NAMES[day]}>
              <Chip
                size="small"
                label={DAY_LABELS[day]}
                variant={simple.days.includes(day) ? "filled" : "outlined"}
                color={simple.days.includes(day) ? "primary" : "default"}
                onClick={() => toggleDay(day)}
                sx={{ width: 36, fontFamily: "monospace" }}
              />
            </Tooltip>
          ))}
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ ml: 1 }}>
          <Switch
            size="small"
            checked={everyDay}
            onChange={(event) =>
              patch({
                schedule: simpleScheduleToCron({
                  hour: simple.hour,
                  minute: simple.minute,
                  // Turning it off leaves weekdays rather than nothing, since
                  // "no days" is not a schedule anyone means.
                  days: event.target.checked ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5],
                }),
              })
            }
          />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Every day
          </Typography>
        </Stack>
      </Row>
    </Fragment>
  );
};

const EngineRow = ({
  schedule,
  patch,
  usableProviders,
  config,
}: {
  schedule: ScheduledBackfillConfig;
  patch: PatchFn;
  usableProviders: AiProviderId[];
  config: AiAnalysisConfig;
}) => {
  const { provider } = AiAnalysisConfigUtils.resolveScheduledProvider({ ...config, scheduledBackfill: schedule });
  return (
    <Fragment>
      {/*
        Only when there is something to choose between, matching the per-run
        engine picker: a choice between one thing is not a choice, it is a
        control that has to be read and dismissed before getting to the rest.
        Only usable engines are offered - an engine that cannot answer is not
        an option, it is a silent failure waiting to happen.
      */}
      {usableProviders.length > 1 && (
        <Row label="Analyse with">
          <Stack direction="row" spacing={0.75}>
            {usableProviders.map((candidate) => (
              <Chip
                key={candidate}
                size="small"
                label={PROVIDER_LABELS[candidate]}
                variant={provider === candidate ? "filled" : "outlined"}
                color={provider === candidate ? "primary" : "default"}
                onClick={() => patch({ provider: candidate })}
              />
            ))}
          </Stack>
        </Row>
      )}
      <FormHelperText sx={{ mx: 0, mb: 2, ml: { sm: "108px" } }}>
        Local runs compete with everything else for this machine, which is the usual reason to schedule them. Claude
        runs don't — but scheduling those still decides when you spend, and when results are waiting for you.
      </FormHelperText>
      {/*
        Hosted only. A cap on a local run would be a limit on something the
        machine already limits, and the estimate has no meaning when nothing is
        being spent - so both appear exactly where they mean something.
      */}
      {provider === "anthropic" && (
        <Row label="Stop after">
          <ZodNumberField
            name="scheduledBackfill.maxPerWindow"
            label="Items per window"
            zodNumber={ScheduledBackfillConfig.shape.maxPerWindow}
          />
        </Row>
      )}
    </Fragment>
  );
};

const EligibilityRows = ({
  schedule,
  patchEligibility,
}: {
  schedule: ScheduledBackfillConfig;
  patchEligibility: (changes: Partial<ScheduledBackfillEligibilityConfig>) => void;
}) => {
  const { eligibility } = schedule;
  const graceOn = eligibility.articleGrace !== undefined;
  return (
    <Fragment>
      <Row label="Only items">
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Switch
            size="small"
            checked={eligibility.requireSubtitles}
            onChange={(event) => patchEligibility({ requireSubtitles: event.target.checked })}
          />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            with subtitles
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Switch
            size="small"
            checked={eligibility.requireArticle}
            onChange={(event) => patchEligibility({ requireArticle: event.target.checked })}
          />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            with a DF article
          </Typography>
        </Stack>
      </Row>

      {eligibility.requireArticle && (
        <Row label="">
          <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap" useFlexGap>
            {/*
              A toggle, not just a duration. Off means "only ever analyse
              things with an article", which is a legitimate thing to want and
              is not expressible if the grace is permanently on - the article
              is worth real accuracy, so waiting indefinitely for one is a
              reasonable choice rather than a misconfiguration.
            */}
            <Switch
              size="small"
              checked={graceOn}
              onChange={(event) =>
                patchEligibility({ articleGrace: event.target.checked ? DEFAULT_ARTICLE_GRACE_MS : undefined })
              }
            />
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              …unless no article appears within
            </Typography>
            {graceOn ? (
              <Fragment>
                <Box sx={{ width: 150 }}>
                  <ZodDurationField
                    name="scheduledBackfill.eligibility.articleGrace"
                    label="Grace period"
                    zodNumber={ScheduledBackfillEligibilityConfig.shape.articleGrace}
                    helperText=" "
                  />
                </Box>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  of publishing — then analyse anyway
                </Typography>
              </Fragment>
            ) : (
              <Typography variant="body2" sx={{ color: "text.disabled" }}>
                — an article is required, however long it takes
              </Typography>
            )}
          </Stack>
        </Row>
      )}
    </Fragment>
  );
};

/**
 * The load-bearing element: what will actually happen, in a sentence.
 *
 * Refetched as the draft changes because the eligibility toggles change the
 * eligible count, and a preview that only refreshed on save would confidently
 * describe the previous settings.
 */
const SchedulePreview = ({ schedule, enabled }: { schedule: ScheduledBackfillConfig; enabled: boolean }) => {
  const [status, setStatus] = useState<ScheduledBackfillStatus>();
  const [error, setError] = useState<string>();
  // Serialised so the effect re-runs on a real change rather than on every
  // render - `schedule` is rebuilt by useWatch each time.
  const draftKey = JSON.stringify(schedule);

  useEffect(() => {
    let cancelled = false;
    // Debounced: the time inputs fire per keystroke, and each one is a request
    // that walks the library to count what is eligible.
    const timer = setTimeout(() => {
      previewScheduledBackfill(JSON.parse(draftKey))
        .then((next) => !cancelled && (setStatus(next), setError(undefined)))
        .catch((e) => !cancelled && setError(e?.message ?? "Could not work out what this schedule would do"));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftKey]);

  if (error) {
    return (
      <Alert severity="error" variant="outlined" sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  }
  if (!status) {
    return null;
  }
  if (status.scheduleError) {
    return (
      <Alert severity="error" variant="outlined" sx={{ mt: 2 }}>
        {status.scheduleError}
      </Alert>
    );
  }

  const now = status.serverTime;
  const nothingEligible = status.eligibleCount === 0;
  /*
   * "More than will finish in one window" is said only when this machine has
   * actually shown it cannot get through that many - compared against the best
   * a completed window has managed, not against a per-item time estimate. A
   * predicted duration would be a number that is often wrong; a past result is
   * a fact about this machine.
   */
  const bestCompleted = Math.max(
    0,
    ...status.history.filter((window) => window.endReason === "closed").map((window) => window.analysed)
  );
  const moreThanFits = bestCompleted > 0 && status.eligibleCount > bestCompleted;

  return (
    <Box sx={{ mt: 3 }}>
      <Box
        sx={{
          borderLeft: 2,
          borderColor: nothingEligible ? "text.disabled" : status.windowOpen ? "warning.main" : "primary.main",
          bgcolor: "action.hover",
          borderRadius: "0 8px 8px 0",
          px: 2,
          py: 1.5,
        }}
      >
        {status.windowOpen && status.closesAt ? (
          <Fragment>
            {/*
              "Stops starting new analyses at 05:00", not "closes at 05:00".
              Someone reading "00:00 until 05:00" will reasonably expect
              everything to halt at 05:00, and it does not - a run started at
              04:58 finishes in its own time. Left implicit, the first overrun
              looks like a bug.
            */}
            <Typography variant="body2">
              Window is <strong>open now</strong> — stops starting new analyses at{" "}
              <strong>{timeOfDay(status.closesAt)}</strong>
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
              {nothingEligible
                ? status.emptyReason ?? "Nothing eligible"
                : `${status.analysedThisWindow} analysed this window${
                    status.failedThisWindow ? `, ${status.failedThisWindow} failed` : ""
                  } · ${status.eligibleCount} remaining`}
            </Typography>
          </Fragment>
        ) : (
          <Fragment>
            <Typography variant="body2">
              {nothingEligible ? (
                <Fragment>
                  Next window <strong>{status.opensAt ? describeWhen(status.opensAt, now) : "—"}</strong> —{" "}
                  <strong>nothing eligible</strong>
                </Fragment>
              ) : (
                <Fragment>
                  Next window opens <strong>{status.opensAt ? describeWhen(status.opensAt, now) : "—"}</strong> and
                  closes at <strong>{status.closesAt ? timeOfDay(status.closesAt) : "—"}</strong>
                </Fragment>
              )}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
              {nothingEligible
                ? status.emptyReason ?? "Nothing eligible"
                : `${status.eligibleCount} item${status.eligibleCount === 1 ? "" : "s"} eligible${
                    moreThanFits ? " — more than will finish in one window" : ""
                  }${
                    status.estimatedCostUsd !== undefined
                      ? ` · roughly $${status.estimatedCostUsd.toFixed(2)} if all of them run`
                      : ""
                  }`}
            </Typography>
          </Fragment>
        )}
        {!status.windowOpen && !nothingEligible && (
          <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 1 }}>
            Starts analyses during the window. One already running at{" "}
            {status.closesAt ? timeOfDay(status.closesAt) : "the end"} finishes rather than being cut off.
          </Typography>
        )}
      </Box>

      {status.providerFellBack && enabled && (
        <Alert severity="warning" variant="outlined" sx={{ mt: 1.5 }}>
          The engine this schedule is set to use isn't available, so runs will use{" "}
          <strong>{status.provider ? PROVIDER_LABELS[status.provider] : "another engine"}</strong> instead.
        </Alert>
      )}

      {/*
        Under the preview because that is where times get interpreted. Cron
        runs in the container's zone, and a server in a different zone to the
        person reading this is the thing that surprises people.
      */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1.5 }}>
        <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "text.disabled" }} />
        <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: "monospace" }}>
          Server time is {timeOfDay(now)} · {status.timeZone}
        </Typography>
      </Stack>

      <RunHistory history={status.history} />
    </Box>
  );
};

const AdvancedSchedule = ({ schedule, patch }: { schedule: ScheduledBackfillConfig; patch: PatchFn }) => {
  const [open, setOpen] = useState(false);
  // Local, so a half-typed expression stays on screen instead of being
  // rejected back to the last valid one under the cursor.
  const [text, setText] = useState(schedule.schedule);
  useEffect(() => setText(schedule.schedule), [schedule.schedule]);

  const problem = validateCronExpression(text);
  const reading = useMemo(() => {
    if (problem) {
      return undefined;
    }
    try {
      return cronstrue.toString(text, { verbose: false });
    } catch {
      // cronstrue is cosmetic - nothing depends on it, so a failure to phrase
      // a valid expression must not look like the expression being wrong.
      return undefined;
    }
  }, [text, problem]);

  return (
    <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: "divider" }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        sx={{ cursor: "pointer" }}
      >
        <ExpandMoreIcon
          fontSize="small"
          sx={{ color: "text.disabled", transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
        />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Advanced
        </Typography>
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={1} sx={{ pt: 2 }}>
          <TextField
            label="Schedule"
            size="small"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              // Only committed when it is valid, so a typo cannot be saved and
              // silently mean "never".
              if (!validateCronExpression(event.target.value)) {
                patch({ schedule: event.target.value.trim() });
              }
            }}
            error={Boolean(problem)}
            helperText={problem ?? (reading ? `Reads as "${reading}"` : "The same setting as the controls above")}
            sx={{ maxWidth: 340, fontFamily: "monospace" }}
          />
          <Divider />
          <FormHelperText sx={{ mx: 0 }}>
            The same setting as the start time and days above, not a second one. This is when the window{" "}
            <strong>opens</strong>; the end time closes it.
          </FormHelperText>
        </Stack>
      </Collapse>
    </Box>
  );
};

const describeOutcome = (window: ScheduledBackfillWindowRecord): string => {
  const worked = `${window.analysed} analysed${window.failed ? `, ${window.failed} failed` : ""}`;
  // The open window appears in this list too, and has no end reason yet - without
  // this it falls through to the default and claims it stopped at a close that
  // has not happened.
  if (!window.endedAt) {
    return `${worked} so far · still open`;
  }
  switch (window.endReason) {
    case "ran_dry":
      return `${worked} · stopped early, nothing left eligible`;
    case "cap_reached":
      return `${worked} · stopped at the per-window limit`;
    case "interrupted":
      return `${worked} · interrupted before the window ended`;
    case "closed":
    default:
      return `${worked} · stopped at close${window.remaining === undefined ? "" : ` with ${window.remaining} remaining`}`;
  }
};

const describeWindowSpan = (window: ScheduledBackfillWindowRecord): string => {
  const ended = window.endedAt ?? window.scheduledCloseAt;
  return `${window.openedAt.toLocaleDateString()} · ${timeOfDay(window.openedAt)}–${timeOfDay(ended)}`;
};

/**
 * Answers "did it actually do anything last night", which the forward-looking
 * preview cannot.
 *
 * Rows expand to the items they analysed rather than linking out to their
 * tasks: completed tasks are cleared within a day or two, so a task link would
 * be broken more often than not - the history carries its own copy of what it
 * did instead.
 */
const RunHistory = ({ history }: { history: ScheduledBackfillWindowRecord[] }) => {
  const [expanded, setExpanded] = useState<string>();
  if (!history.length) {
    return null;
  }
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="overline" sx={{ color: "text.disabled" }}>
        Recent windows
      </Typography>
      <Stack sx={{ mt: 1 }}>
        {history.map((window) => (
          <Box key={window.id} sx={{ py: 1, borderTop: 1, borderColor: "divider" }}>
            <Stack direction="row" alignItems="baseline" spacing={2} flexWrap="wrap" useFlexGap>
              <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                {describeWindowSpan(window)}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", flex: "1 1 auto" }}>
                {describeOutcome(window)}
              </Typography>
              {window.items.length > 0 && (
                <MuiLink
                  component="button"
                  type="button"
                  variant="caption"
                  onClick={() => setExpanded(expanded === window.id ? undefined : window.id)}
                >
                  {expanded === window.id ? "Hide" : "View"}
                </MuiLink>
              )}
            </Stack>
            <Collapse in={expanded === window.id} unmountOnExit>
              <Stack sx={{ pl: 2, pt: 1 }}>
                {window.items.map((item) => (
                  <Typography key={item.key} variant="caption" sx={{ color: "text.disabled" }}>
                    {item.title}
                  </Typography>
                ))}
              </Stack>
            </Collapse>
          </Box>
        ))}
      </Stack>
    </Box>
  );
};


/** "every day", "Mon-Fri", "Mon, Wed, Fri" - however few words it takes. */
const describeDays = (schedule: string): string => {
  const simple = cronToSimpleSchedule(schedule);
  if (!simple) {
    return "on a custom schedule";
  }
  if (simple.days.length === 7) {
    return "every day";
  }
  const inWeekOrder = DAY_ORDER.filter((day) => simple.days.includes(day));
  if (inWeekOrder.length === 5 && [1, 2, 3, 4, 5].every((day) => simple.days.includes(day))) {
    return "Mon-Fri";
  }
  return inWeekOrder.map((day) => DAY_NAMES[day].slice(0, 3)).join(", ");
};

/**
 * The pointer from the AI Analysis page to the schedule.
 *
 * Scheduling has a page of its own, so the page people reach first has to
 * point at it - otherwise the feature is only findable by someone who already
 * knows it exists. Carrying the current state in the link costs nothing and
 * answers the question most people came to ask without making them navigate.
 */
export const ScheduledBackfillLink = () => {
  const { control } = useFormContext<AiAnalysisConfig>();
  const schedule = useWatch({ control, name: "scheduledBackfill" }) as ScheduledBackfillConfig | undefined;
  const [status, setStatus] = useState<ScheduledBackfillStatus>();
  useEffect(() => {
    let cancelled = false;
    // No draft: this describes what is actually saved and running, not what is
    // being edited on the page it sits on.
    previewScheduledBackfill()
      .then((next) => !cancelled && setStatus(next))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const on = Boolean(schedule?.enabled);
  const startTime = schedule ? startTimeOf(schedule.schedule) : undefined;
  const summary =
    on && schedule && startTime
      ? [
          "On",
          `${describeDays(schedule.schedule)} ${startTime}–${schedule.endTime}`,
          status ? `${status.eligibleCount} item${status.eligibleCount === 1 ? "" : "s"} remaining` : undefined,
        ]
          .filter(Boolean)
          .join(" · ")
      : "Work through your back catalogue automatically, during hours you choose";

  return (
    <Box
      component={Link}
      to="/settings/scheduled-backfill"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 2,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <Box>
        <Typography variant="body1">Scheduled backfill</Typography>
        <Typography variant="caption" sx={{ color: on ? "primary.main" : "text.secondary" }}>
          {summary}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ color: on ? "primary.main" : "text.secondary", flex: "none" }}>
        {on ? "Manage →" : "Set up →"}
      </Typography>
    </Box>
  );
};
