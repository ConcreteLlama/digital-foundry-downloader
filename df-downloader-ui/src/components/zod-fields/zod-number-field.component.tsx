import { TextFieldElement } from "react-hook-form-mui";
import { ZodNumber } from "zod";

export type ZodNumberFieldProps = {
  name: string;
  label: string;
  helperText?: string;
  zodNumber: ZodNumber;
  step?: number;
};

export const ZodNumberField = ({ name, label, zodNumber, helperText, step }: ZodNumberFieldProps) => {
  return (
    <TextFieldElement
      name={name}
      label={label}
      helperText={helperText}
      type="number"
      inputProps={{
        min: zodNumber.minValue,
        max: zodNumber.maxValue,
        step,
      }}
      value={zodNumber.default}
    />
  );
};
