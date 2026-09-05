import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { IconButton, InputAdornment } from "@mui/material";
import { SxProps } from "@mui/system";
import { ChangeEventHandler, CSSProperties, useState } from "react";
import { TextFieldElement, TextFieldElementProps } from "react-hook-form-mui";
import { ZodString } from "zod";
import { isSecretSchema } from "df-downloader-common/config/secrets";
import { ZodStringLike, getZodDescription, isZodOptionalLike, unwrapZodSchema } from "./zod-schema-utils";

export type ZodStringFieldProps = {
  name: string;
  label: string;
  /** Overrides the schema's own `.describe()` text, for the rare field that needs context the schema can't know. */
  helperText?: string;
  zodString: ZodStringLike;
  /**
   * Force masking on for a field the schema does not mark.
   *
   * Normally unnecessary and better left alone: masking is derived from
   * `.meta({ secret: true })` on the schema itself, which is the same
   * declaration the diagnostic bundle redacts on. Keeping a second list here
   * is how the two drift, and the way they drift is that a new credential
   * gets masked on screen and shipped in a bundle.
   */
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
  const [revealed, setRevealed] = useState(false);
  const masked = isPassword || isSecretSchema(zodString);
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
  if (!masked) {
    return <TextFieldElement {...props} />;
  }
  /*
   * Masked, but deliberately NOT type="password".
   *
   * Every field that reaches this branch is a machine credential - an API key,
   * a Plex token, a DF session cookie - and none of them is a login. Chrome
   * treats any real password input inside a submitting form as something to
   * offer to save, and ignores autocomplete="off" for that purpose, so these
   * settings kept prompting to save "passwords" that no browser will ever fill
   * in. The app's actual login form uses PasswordElement directly and is
   * untouched, so that one still saves normally.
   *
   * Caveat worth knowing: -webkit-text-security covers Chrome, Edge and
   * Safari. Firefox does not implement it, and will show these in the clear.
   */
  return (
    <TextFieldElement
      {...props}
      autoComplete="off"
      inputProps={{
        ...props.inputProps,
        style: { WebkitTextSecurity: revealed ? "none" : "disc" } as CSSProperties,
      }}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              onClick={() => setRevealed((current) => !current)}
              edge="end"
              size="small"
              aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
            >
              {revealed ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
};
