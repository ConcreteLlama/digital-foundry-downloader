import { TextField } from "@mui/material";
import { formatDurationMs, parseDurationMs } from "df-downloader-common";
import { useEffect, useRef, useState } from "react";
import { useController, useFormContext } from "react-hook-form";
import { ZodNumberLike, getZodDescription, unwrapZodSchema } from "./zod-schema-utils";
import { ZodNumber } from "zod";

/**
 * A duration, stored in milliseconds and shown as something readable.
 *
 * The config keeps milliseconds because that is what the timers take, and
 * nothing about that changes here - this is only the presentation. "43200000"
 * tells you nothing at a glance and is easy to mistype by a factor of ten;
 * "12h" is the same value in the terms the setting is actually thought about.
 *
 * Accepts what it displays, plus a bare number of milliseconds so anything
 * pasted from the old field still means what it did.
 */
export type ZodDurationFieldProps = {
  name: string;
  label: string;
  helperText?: string;
  zodNumber: ZodNumberLike;
};

export const ZodDurationField = ({ name, label, zodNumber, helperText }: ZodDurationFieldProps) => {
  const { control } = useFormContext();
  const { field, fieldState } = useController({ name, control });
  const schema = unwrapZodSchema<ZodNumber>(zodNumber);
  // Our own handle on the input: react-hook-form's `ref` is a callback, so it
  // cannot be read to find out whether this field currently has focus.
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState(() =>
    typeof field.value === "number" ? formatDurationMs(field.value) : ""
  );
  const [invalid, setInvalid] = useState(false);
  /**
   * The format is only worth explaining while you are about to use it.
   *
   * A help icon on each of these would be nine permanent affordances for one
   * sentence you read once, and the hint is no use sitting in the description
   * where it competes with what the setting actually does. On focus it costs
   * nothing at rest and arrives exactly when it is needed.
   */
  const [focused, setFocused] = useState(false);

  // Follows the value when something else changes it - a section reset, or the
  // saved config arriving after first render - but not while being edited,
  // which would rewrite the box under the cursor.
  useEffect(() => {
    if (document.activeElement === inputRef.current) {
      return;
    }
    if (typeof field.value === "number") {
      setText(formatDurationMs(field.value));
    }
  }, [field.value]);

  const commit = (next: string) => {
    setText(next);
    const parsed = parseDurationMs(next);
    if (parsed === undefined) {
      // Left in the box rather than reverted: someone mid-way through typing
      // "1h" has written "1", and snapping that back is worse than waiting.
      setInvalid(next.trim().length > 0);
      return;
    }
    setInvalid(false);
    field.onChange(parsed);
  };

  // Number.isFinite, not a null check: an unbounded zod number reports its
  // limit as Infinity rather than undefined, which rendered as the genuinely
  // unhelpful "at most Infinity".
  const bounds = [
    Number.isFinite(schema.minValue) ? `at least ${formatDurationMs(schema.minValue!)}` : undefined,
    Number.isFinite(schema.maxValue) ? `at most ${formatDurationMs(schema.maxValue!)}` : undefined,
  ].filter(Boolean);

  const description = helperText ?? getZodDescription(zodNumber);
  const error = invalid
    ? 'Try something like "12h", "30m" or "1d 6h"'
    : fieldState.error?.message ?? undefined;

  return (
    <TextField
      name={field.name}
      inputRef={(element: HTMLInputElement | null) => {
        inputRef.current = element;
        field.ref(element);
      }}
      label={label}
      value={text}
      onChange={(event) => commit(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        // Canonicalised on the way out, so "90m" settles as "1h 30m" and the
        // stored value and the box agree about what was set.
        if (typeof field.value === "number" && !invalid) {
          setText(formatDurationMs(field.value));
        }
        field.onBlur();
      }}
      error={Boolean(error)}
      helperText={
        error ??
        (focused
          ? 'Type it how you would say it: "12h", "30m", "5m 30s", "1d 6h" - or a plain number of milliseconds'
          : [description, bounds.join(", ")].filter(Boolean).join(" "))
      }
    />
  );
};
