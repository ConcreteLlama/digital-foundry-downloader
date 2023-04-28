import { TextFieldElement } from "react-hook-form-mui";
import { ZodNumber } from "zod";

export type ZodNumberFieldProps = {
  name: string;
  label: string;
  helperText?: string;
  zodNumber: ZodNumber;
};

export const ZodNumberField = ({ name, label, zodNumber, helperText }: ZodNumberFieldProps) => {
  return (
    <TextFieldElement
      name={name}
      label={label}
      helperText={helperText}
      type="number"
      inputProps={{
        min: zodNumber.minValue,
        max: zodNumber.maxValue,
      }}
      value={zodNumber.default}
    />
  );
};
