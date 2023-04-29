import { SxProps } from "@mui/system";
import { ChangeEventHandler } from "react";
import { TextFieldElement } from "react-hook-form-mui";
import { ZodString } from "zod";

export type ZodStringFieldProps = {
  name: string;
  label: string;
  helperText?: string;
  zodString: ZodString;
  onChange?: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  sx?: SxProps;
};

export const ZodTextField = ({ name, label, zodString, helperText, onChange, sx = {} }: ZodStringFieldProps) => {
  return (
    <TextFieldElement
      name={name}
      label={label}
      helperText={helperText}
      onChange={onChange}
      type="text"
      inputProps={{
        min: zodString.minLength,
        max: zodString.maxLength,
      }}
      value={zodString.default}
      sx={sx}
    />
  );
};
