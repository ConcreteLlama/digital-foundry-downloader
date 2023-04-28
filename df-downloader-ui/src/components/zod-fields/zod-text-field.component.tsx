import { TextFieldElement } from "react-hook-form-mui";
import { ZodString } from "zod";

export type ZodStringFieldProps = {
  name: string;
  label: string;
  helperText?: string;
  zodString: ZodString;
};

export const ZodTextField = ({ name, label, zodString, helperText }: ZodStringFieldProps) => {
  return (
    <TextFieldElement
      name={name}
      label={label}
      helperText={helperText}
      type="text"
      inputProps={{
        min: zodString.minLength,
        max: zodString.maxLength,
      }}
      value={zodString.default}
    />
  );
};
