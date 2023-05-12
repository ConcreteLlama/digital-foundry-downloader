import { z } from "zod";
import { ZodOptional } from "zod";
import { SelectField } from "../general/select-field";

export type ZodSelectFieldProps<T extends [string, ...string[]]> = {
  name: string;
  label: string;
  helperText?: string;
  zodEnum: z.ZodEnum<T> | ZodOptional<z.ZodEnum<T>>;
  onChange?: (value: T[number] | null) => void;
  nullable?: boolean;
};

export const ZodSelectField = <T extends [string, ...string[]]>({
  name,
  label,
  zodEnum,
  helperText,
  onChange,
  nullable = false,
}: ZodSelectFieldProps<T>) => {
  // This is a little hacky, probably better way to do it
  const zodEnumActual = zodEnum instanceof ZodOptional ? zodEnum._def.innerType : zodEnum;
  const opts = Object.entries(zodEnumActual.Values).map(([key, value]) => ({
    id: value as T[number],
    label: key,
  }));
  return (
    <SelectField
      name={name}
      label={label}
      helperText={helperText}
      opts={opts}
      onChange={onChange}
      nullable={nullable}
    />
  );
};
