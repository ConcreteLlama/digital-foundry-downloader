/**
 * Enough cron to validate an expression and say what is wrong with it.
 *
 * Deliberately *not* a scheduler. Working out when a cron expression next
 * fires is the service's job and it uses `cron-parser` for it - this is only
 * the part both sides need, and putting it here means the settings panel can
 * reject a typo without the UI bundle carrying a scheduling library.
 *
 * The reason it exists at all rather than deferring to cron-parser's own
 * errors: those are field-agnostic. `0 2 * * 9` reports "Constraint error, got
 * value 9 expected range 0-7", which does not say *which* of five fields is
 * wrong, and a five-field expression with four fields
 * (`0 2 * *`) is accepted outright. A typo that silently means "never" is the
 * specific failure this feature cannot afford, since a schedule that never
 * fires looks exactly like one that is working.
 */

type CronFieldSpec = {
  /** How the message names it: "Day of week must be 0-7". */
  label: string;
  min: number;
  max: number;
  /** Names accepted in place of numbers, lowercase, in value order from `min`. */
  names?: string[];
};

const CRON_FIELDS: CronFieldSpec[] = [
  { label: "Minute", min: 0, max: 59 },
  { label: "Hour", min: 0, max: 23 },
  { label: "Day of month", min: 1, max: 31 },
  {
    label: "Month",
    min: 1,
    max: 12,
    names: ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
  },
  {
    label: "Day of week",
    min: 0,
    // 7 as well as 0 for Sunday, which is near-universal and what cron-parser
    // accepts - rejecting it here would fail expressions the scheduler runs.
    max: 7,
    names: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
  },
];

/** Resolves a name or a number to its numeric value, or undefined if neither. */
const readValue = (token: string, spec: CronFieldSpec): number | undefined => {
  const named = spec.names?.indexOf(token.toLowerCase());
  if (named !== undefined && named >= 0) {
    return named + spec.min;
  }
  return /^\d+$/.test(token) ? Number(token) : undefined;
};

const describeRange = (spec: CronFieldSpec) => `${spec.min}-${spec.max}`;

/**
 * Checks one comma-separated field.
 *
 * Returns a sentence in the "what is wrong, and what it should have been"
 * shape the settings panel shows verbatim, or undefined when the field is
 * fine.
 */
const validateField = (raw: string, spec: CronFieldSpec): string | undefined => {
  for (const part of raw.split(",")) {
    if (!part.length) {
      return `${spec.label} has an empty entry - check for a stray comma`;
    }
    // Step first: "*/15", "1-30/5" and "*" all reduce to a range plus a step.
    const [rangePart, stepPart, ...extraSteps] = part.split("/");
    if (extraSteps.length) {
      return `${spec.label} has more than one "/" in "${part}"`;
    }
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart) || Number(stepPart) < 1) {
        return `${spec.label} step must be a whole number of 1 or more - "${stepPart}" is not`;
      }
    }
    if (rangePart === "*") {
      continue;
    }
    const bounds = rangePart.split("-");
    if (bounds.length > 2) {
      return `${spec.label} has more than one "-" in "${rangePart}"`;
    }
    const values: number[] = [];
    for (const bound of bounds) {
      const value = readValue(bound, spec);
      if (value === undefined) {
        return `${spec.label} must be ${describeRange(spec)}${
          spec.names ? ` or a name like ${spec.names[0]}` : ""
        } - "${bound}" is not`;
      }
      if (value < spec.min || value > spec.max) {
        return `${spec.label} must be ${describeRange(spec)} - "${bound}" is not a${
          spec.label === "Hour" ? "n" : ""
        } ${spec.label.toLowerCase()}`;
      }
      values.push(value);
    }
    if (values.length === 2 && values[0] > values[1]) {
      return `${spec.label} range "${rangePart}" runs backwards - ${values[0]} is after ${values[1]}`;
    }
  }
  return undefined;
};

/**
 * Why this expression cannot be used, or undefined when it can.
 *
 * Five fields only. Seconds-resolution cron (six fields) is something
 * cron-parser accepts, and allowing it here would let someone schedule a
 * window that opens every second - which is not a window.
 */
export const validateCronExpression = (expression: string): string | undefined => {
  const trimmed = expression.trim();
  if (!trimmed) {
    return "Enter a schedule, e.g. 0 0 * * * for midnight every day";
  }
  const fields = trimmed.split(/\s+/);
  if (fields.length !== CRON_FIELDS.length) {
    return `A schedule has five parts - minute, hour, day of month, month, day of week - and this has ${fields.length}`;
  }
  for (let i = 0; i < fields.length; i++) {
    const problem = validateField(fields[i], CRON_FIELDS[i]);
    if (problem) {
      return problem;
    }
  }
  return undefined;
};

/**
 * The days of the week a schedule fires on, or undefined when the expression
 * is not one the plain-language controls can represent.
 *
 * Sunday is 0. Returned sorted and de-duplicated, so `1-5` and `5,4,3,2,1`
 * give the same answer.
 */
const parseDayField = (field: string): number[] | undefined => {
  if (field === "*") {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  const days = new Set<number>();
  for (const part of field.split(",")) {
    if (part.includes("/")) {
      return undefined;
    }
    const bounds = part.split("-").map((bound) => readValue(bound, CRON_FIELDS[4]));
    if (bounds.some((bound) => bound === undefined)) {
      return undefined;
    }
    // 7 and 0 are both Sunday; normalising here stops "0,7" reading as two days.
    const normalise = (value: number) => value % 7;
    if (bounds.length === 1) {
      days.add(normalise(bounds[0]!));
    } else if (bounds.length === 2) {
      const [from, to] = bounds as [number, number];
      if (from > to) {
        return undefined;
      }
      for (let day = from; day <= to; day++) {
        days.add(normalise(day));
      }
    } else {
      return undefined;
    }
  }
  return [...days].sort((a, b) => a - b);
};

export type SimpleSchedule = {
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
  /** Sunday is 0. */
  days: number[];
};

/**
 * Reads an expression back into the start time and days the plain controls
 * show, or undefined when it says something they cannot.
 *
 * This is what lets the friendly controls and the advanced cron field be one
 * setting rather than two: whatever is stored is the truth, and the controls
 * render it when they can and step aside when they cannot.
 */
export const cronToSimpleSchedule = (expression: string): SimpleSchedule | undefined => {
  if (validateCronExpression(expression)) {
    return undefined;
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = expression.trim().split(/\s+/);
  // A window that only opens on the 3rd of March is expressible in cron and
  // not in "start at / on these days", so the controls must not pretend.
  if (dayOfMonth !== "*" || month !== "*") {
    return undefined;
  }
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) {
    return undefined;
  }
  const days = parseDayField(dayOfWeek);
  return days ? { hour: Number(hour), minute: Number(minute), days } : undefined;
};

/** The expression for a start time and a set of days. Sunday is 0. */
export const simpleScheduleToCron = ({ hour, minute, days }: SimpleSchedule): string => {
  const unique = [...new Set(days.map((day) => day % 7))].sort((a, b) => a - b);
  const dayField = unique.length === 0 || unique.length === 7 ? "*" : unique.join(",");
  return `${minute} ${hour} * * ${dayField}`;
};
