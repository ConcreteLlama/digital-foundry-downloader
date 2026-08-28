import { ZodBoolean, ZodDefault, ZodEnum, ZodNullable, ZodNumber, ZodOptional, ZodString, ZodType } from "zod";

/**
 * Helper text for the settings forms comes from the schema's own
 * `.describe()` text, so the wording lives next to the field it describes
 * rather than being restated in the form (see df-downloader-common/src/config).
 *
 * Two things make that fiddlier than just reading `schema.description`:
 *
 * 1. `.describe()` only reads back if it's the *last* call in the chain -
 *    `z.string().describe("x").optional()` leaves the description on the inner
 *    string, where `.description` on the outer optional returns undefined. The
 *    config schemas all put `.describe()` last, but a field can still be
 *    reached at either level depending on what the form passes.
 * 2. The fields need the base type for its bounds (`minValue`, `enum`, ...),
 *    which a `.default()`/`.optional()` wrapper doesn't expose.
 *
 * So rather than have every call site pick the right level, these walk the
 * wrapper chain and the components take whichever form is convenient.
 */

/** A base schema, or one wrapped in any combination of default/optional/nullable. */
export type Wrapped<T extends ZodType> = T | ZodDefault<Wrapped<T>> | ZodOptional<Wrapped<T>> | ZodNullable<Wrapped<T>>;

export type ZodNumberLike = Wrapped<ZodNumber>;
export type ZodStringLike = Wrapped<ZodString>;
export type ZodBooleanLike = Wrapped<ZodBoolean>;
export type ZodEnumLike<T extends Readonly<Record<string, string>>> = Wrapped<ZodEnum<T>>;

const innerOf = (schema: unknown): unknown => (schema as { _def?: { innerType?: unknown } })?._def?.innerType;

/** Strips default/optional/nullable wrappers to get at the base schema. */
export const unwrapZodSchema = <T extends ZodType>(schema: Wrapped<T>): T => {
  let current: unknown = schema;
  let inner = innerOf(current);
  while (inner) {
    current = inner;
    inner = innerOf(current);
  }
  return current as T;
};

/** The `.describe()` text, wherever in the wrapper chain it was set. */
export const getZodDescription = (schema: unknown): string | undefined => {
  let current: unknown = schema;
  while (current) {
    const description = (current as ZodType).description;
    if (description) {
      return description;
    }
    current = innerOf(current);
  }
  return undefined;
};

/**
 * Whether the value is allowed to be absent entirely.
 *
 * Deliberately doesn't count `.default()`: a field with a default still wants
 * a value in it, and treating it as optional would drop the required marker
 * from fields that have always carried one.
 */
export const isZodOptionalLike = (schema: unknown): boolean => {
  let current: unknown = schema;
  while (current) {
    if (current instanceof ZodOptional || current instanceof ZodNullable) {
      return true;
    }
    current = innerOf(current);
  }
  return false;
};
