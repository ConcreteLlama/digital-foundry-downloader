import { z } from "zod";

/**
 * Knowing which config fields are credentials, in one place.
 *
 * This used to be knowledge held only by the settings forms, as an
 * `isPassword` prop passed at a handful of call sites, with the schema itself
 * knowing nothing. That was survivable while masking on screen was the only
 * consumer. It stops being survivable the moment configuration is written
 * into a file someone attaches to a public issue: a second hand-kept list
 * means the first time anyone adds a credential, the form masks it and the
 * diagnostic bundle ships it.
 *
 * So it is declared once, on the schema - `.meta({ secret: true })` - and
 * both consumers read it from there.
 */

/** What a redacted value is replaced with. */
export const REDACTED = "<redacted>";

/**
 * Field names that are treated as secret whether or not anyone marked them.
 *
 * A backstop, not the mechanism. One declaration somebody forgot is the whole
 * failure, and the cost of over-redacting a field that merely sounds like a
 * credential is nil next to the cost of leaking one that is.
 */
export const SECRET_NAME_PATTERN = /token|key|secret|password|cookie|autologin|credential/i;

/** Unwraps optional/nullable/default/effects to reach the schema underneath. */
const unwrap = (schema: z.ZodTypeAny): z.ZodTypeAny => {
  let current: any = schema;
  // Each wrapper holds its inner type in a slightly different place across
  // zod's own versions, so this checks the known ones rather than assuming.
  for (let depth = 0; depth < 10; depth++) {
    const inner = current?._def?.innerType ?? current?._def?.schema ?? current?.unwrap?.();
    if (!inner || inner === current) {
      return current;
    }
    current = inner;
  }
  return current;
};

const metaOf = (schema: unknown): Record<string, unknown> | undefined =>
  schema ? (schema as any).meta?.() ?? (unwrap(schema as z.ZodTypeAny) as any).meta?.() : undefined;

/*
 * Takes `unknown` rather than a zod type on purpose.
 *
 * The settings forms hold their schemas in a union that TypeScript cannot
 * instantiate against ZodTypeAny without giving up ("excessively deep"), and
 * the check is a runtime metadata read that does not need the type anyway.
 */
/** Whether a field was declared a secret, following any wrappers. */
export const isSecretSchema = (schema: unknown): boolean => metaOf(schema)?.secret === true;

/**
 * Whether someone has decided either way about this field.
 *
 * `.meta({ secret: false })` is a real answer, not an absence - it records
 * that a credential-sounding field was looked at and judged not to be one, so
 * the check below stops asking about it.
 */
const hasSecretDecision = (schema: unknown): boolean => "secret" in (metaOf(schema) ?? {});

/** The object schema's fields, or undefined when it isn't one. */
const objectShape = (schema: z.ZodTypeAny | undefined): Record<string, z.ZodTypeAny> | undefined => {
  const unwrapped: any = schema && unwrap(schema);
  const shape = unwrapped?.shape ?? unwrapped?._def?.shape;
  if (!shape) {
    return undefined;
  }
  return typeof shape === "function" ? shape() : shape;
};

/**
 * A copy of some configuration with every credential replaced.
 *
 * Replaced rather than removed, deliberately. `"apiKey": "<redacted>"` tells
 * a reader the key is set, which is very often the actual question - removing
 * it is indistinguishable from it never having been configured, which sends
 * everyone down the wrong path.
 *
 * Walks the value against the schema where it can and falls back to the name
 * pattern where it cannot, so a field the schema does not describe - anything
 * hand-added to config.yaml, or a section added since - is still covered.
 */
export const redactSecrets = <T>(value: T, schema?: z.ZodTypeAny, keyName?: string): T => {
  // An explicit decision beats the heuristic in both directions. The name
  // pattern only gets a say where nobody has said anything, so declaring a
  // field not-secret - a path to a key file, say - actually holds, rather
  // than being overruled by the very pattern it was written to answer.
  // The heuristic applies to strings only. A credential is a string, and
  // names like "resetTokenValidity" are durations that happen to contain
  // "token" - replacing a number with "<redacted>" hides a setting somebody
  // may well be trying to debug, and protects nothing. An explicit mark still
  // redacts whatever it is put on.
  const secret = hasSecretDecision(schema)
    ? isSecretSchema(schema)
    : typeof value === "string" && Boolean(keyName && SECRET_NAME_PATTERN.test(keyName));
  if (keyName && secret) {
    // Only ever stands in for a scalar. An object whose *name* matches the
    // pattern - "tokenSettings", say - would otherwise vanish wholesale.
    if (value === null || typeof value !== "object") {
      return (value === undefined || value === "" ? value : (REDACTED as unknown as T));
    }
  }
  if (Array.isArray(value)) {
    const element = (unwrap(schema as z.ZodTypeAny) as any)?._def?.type ?? (unwrap(schema as z.ZodTypeAny) as any)?.element;
    return value.map((entry) => redactSecrets(entry, element)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const shape = objectShape(schema);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        redactSecrets(entry, shape?.[key], key),
      ])
    ) as unknown as T;
  }
  return value;
};

/**
 * Every string field in a schema whose name looks like a credential but which
 * nobody marked.
 *
 * Used by a test rather than at runtime: the point is to fail a build when a
 * new credential is added without a `.meta({ secret: true })`, so the omission
 * is caught by whoever added it rather than by whoever reads their bundle.
 */
export const findUnmarkedSecrets = (schema: z.ZodTypeAny, path: string[] = []): string[] => {
  const shape = objectShape(schema);
  if (!shape) {
    return [];
  }
  return Object.entries(shape).flatMap(([key, field]) => {
    const here = [...path, key];
    const nested = findUnmarkedSecrets(field, here);
    // Strings only: a credential is a string, and names like
    // "resetTokenValidity" are durations that happen to contain "token".
    const isString = unwrap(field) instanceof z.ZodString;
    if (SECRET_NAME_PATTERN.test(key) && isString && !hasSecretDecision(field)) {
      return [here.join("."), ...nested];
    }
    return nested;
  });
};
