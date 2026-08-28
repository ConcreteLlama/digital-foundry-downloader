import { z } from "zod";
import { SelectField } from "../general/select-field";
import { ZodEnumLike, getZodDescription, unwrapZodSchema } from "./zod-schema-utils";

// zod v4 reworked ZodEnum's type param from a string tuple ([string, ...string[]])
// to an object map (Readonly<Record<string, string>>, matching the new
// z.enum() overload that also accepts native TS enums) - .Values was renamed
// to .enum (still an object map); .options (array of values) is unchanged.
export type ZodSelectFieldProps<T extends Readonly<Record<string, string>>> = {
  name: string;
  label: string;
  /** Overrides the schema's own `.describe()` text, for the rare field that needs context the schema can't know. */
  helperText?: string;
  zodEnum: ZodEnumLike<T>;
  onChange?: (value: T[keyof T] | null) => void;
  nullable?: boolean;
};

export const ZodSelectField = <T extends Readonly<Record<string, string>>>({
  name,
  label,
  zodEnum,
  helperText,
  onChange,
  nullable = false,
}: ZodSelectFieldProps<T>) => {
  const zodEnumActual = unwrapZodSchema<z.ZodEnum<T>>(zodEnum);
  const opts = Object.entries(zodEnumActual.enum).map(([key, value]) => ({
    id: value as T[keyof T],
    label: key,
  }));
  return (
    <SelectField
      name={name}
      label={label}
      helperText={helperText ?? getZodDescription(zodEnum)}
      opts={opts}
      onChange={onChange as ((value: string | null) => void) | undefined}
      nullable={nullable}
    />
  );
};
