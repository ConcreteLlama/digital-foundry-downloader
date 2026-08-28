import { CheckboxElement } from "react-hook-form-mui";
import { ZodBooleanLike, getZodDescription } from "./zod-schema-utils";

export type ZodCheckboxFieldProps = {
  name: string;
  label: string;
  /** Overrides the schema's own `.describe()` text, for the rare field that needs context the schema can't know. */
  helperText?: string;
  zodBoolean: ZodBooleanLike;
};

export const ZodCheckboxField = ({ name, label, zodBoolean, helperText }: ZodCheckboxFieldProps) => (
  <CheckboxElement name={name} label={label} helperText={helperText ?? getZodDescription(zodBoolean)} />
);
