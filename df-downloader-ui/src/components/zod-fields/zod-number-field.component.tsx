import { TextFieldElement } from "react-hook-form-mui";
import { ZodNumber } from "zod";
import { ZodNumberLike, getZodDescription, unwrapZodSchema } from "./zod-schema-utils";

export type ZodNumberFieldProps = {
  name: string;
  label: string;
  /** Overrides the schema's own `.describe()` text, for the rare field that needs context the schema can't know. */
  helperText?: string;
  zodNumber: ZodNumberLike;
  step?: number;
};

export const ZodNumberField = ({ name, label, zodNumber, helperText, step }: ZodNumberFieldProps) => {
  const zodNumberActual = unwrapZodSchema<ZodNumber>(zodNumber);
  return (
    <TextFieldElement
      name={name}
      label={label}
      helperText={helperText ?? getZodDescription(zodNumber)}
      type="number"
      inputProps={{
        min: zodNumberActual.minValue,
        max: zodNumberActual.maxValue,
        step,
      }}
      value={zodNumberActual.default}
    />
  );
};
