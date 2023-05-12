import { SxProps } from "@mui/system";
import { ChangeEventHandler } from "react";
import { PasswordElement, TextFieldElement, TextFieldElementProps } from "react-hook-form-mui";
import { ZodOptional, ZodString } from "zod";

export type ZodStringFieldProps = {
  name: string;
  label: string;
  helperText?: string;
  zodString: ZodString | ZodOptional<ZodString>;
  isPassword?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  disabled?: boolean;
  sx?: SxProps;
};

export const ZodTextField = ({
  name,
  label,
  zodString,
  helperText,
  isPassword,
  onChange,
  disabled,
  sx = {},
}: ZodStringFieldProps) => {
  const isOptional = zodString instanceof ZodOptional;
  const zodStringActual = zodString instanceof ZodOptional ? zodString._def.innerType : zodString;
  const props: TextFieldElementProps = {
    name,
    label,
    helperText,
    onChange,
    type: "text",
    inputProps: {
      min: isOptional ? 0 : zodStringActual.minLength,
      max: zodStringActual.maxLength,
    },
    required: !isOptional,
    value: zodStringActual.default,
    sx: sx,
    disabled,
  };
  return isPassword ? <PasswordElement {...props} /> : <TextFieldElement {...props} />;
};
