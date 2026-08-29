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
  /**
   * Render as a growing textarea rather than a single line.
   *
   * For the handful of settings that hold prose rather than a value - extra
   * prompt instructions, for instance - where a one-line input makes text
   * longer than the box unreadable while editing it.
   */
  multiline?: boolean;
};

export const ZodTextField = ({
  name,
  label,
  zodString,
  helperText,
  isPassword,
  onChange,
  disabled,
  multiline,
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
    multiline,
    // Grows with the content up to a point, then scrolls - an unbounded
    // textarea in a settings form pushes everything below it off screen.
    minRows: multiline ? 2 : undefined,
    maxRows: multiline ? 8 : undefined,
  };
  return isPassword ? <PasswordElement {...props} /> : <TextFieldElement {...props} />;
};
