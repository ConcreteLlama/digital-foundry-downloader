import { SxProps } from "@mui/system";
import { ChangeEventHandler } from "react";
import { PasswordElement, TextFieldElement, TextFieldElementProps } from "react-hook-form-mui";
import { ZodString } from "zod";
import { ZodStringLike, getZodDescription, isZodOptionalLike, unwrapZodSchema } from "./zod-schema-utils";

export type ZodStringFieldProps = {
  name: string;
  label: string;
  /** Overrides the schema's own `.describe()` text, for the rare field that needs context the schema can't know. */
  helperText?: string;
  zodString: ZodStringLike;
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
  const isOptional = isZodOptionalLike(zodString);
  const zodStringActual = unwrapZodSchema<ZodString>(zodString);
  const props: TextFieldElementProps = {
    name,
    label,
    helperText: helperText ?? getZodDescription(zodString),
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
