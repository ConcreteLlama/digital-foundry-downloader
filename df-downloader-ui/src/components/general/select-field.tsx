import { Box, IconButton } from "@mui/material";
import { SelectElement, useFormContext } from "react-hook-form-mui";
import ClearIcon from "@mui/icons-material/Clear";
import { useState } from "react";

export type BaseSelectFieldProps<T extends string> = {
  name: string;
  label: string;
  helperText?: string;
  nullable?: boolean;
  onChange?: (value: T[number] | null) => void;
};

export type SelectFieldProps<T extends string> = BaseSelectFieldProps<T> & {
  opts: {
    id: T;
    label: string;
  }[];
};

export const SelectField = <T extends string>({
  name,
  label,
  opts,
  helperText,
  onChange,
  nullable = false,
}: SelectFieldProps<T>) => {
  const formContext = useFormContext();
  const initValue = formContext.getValues()[name];
  const [currentValue, setCurrentValue] = useState(initValue);
  onChange && onChange(initValue);
  return (
    <Box sx={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
      <SelectElement
        name={name}
        label={label}
        helperText={helperText}
        options={opts}
        onChange={(value) => {
          setCurrentValue(value);
          onChange && onChange(value);
        }}
        sx={{ width: "100%" }}
      />
      {nullable && (
        <IconButton
          disabled={currentValue === null}
          onClick={() => {
            formContext.setValue(name, null, {
              shouldDirty: true,
            });
            setCurrentValue(null);
            onChange && onChange(null);
          }}
          sx={{ marginBottom: helperText ? "16px" : undefined }}
        >
          <ClearIcon />
        </IconButton>
      )}
    </Box>
  );
};

export type EnumSelectFieldProps<T extends string> = BaseSelectFieldProps<T> & {
  enum: Record<string, T>;
};

export const EnumSelectField = <T extends string>({
  name,
  label,
  enum: enumObj,
  helperText,
  onChange,
  nullable = false,
}: EnumSelectFieldProps<T>) => {
  const opts = Object.entries(enumObj).map(([key, value]) => ({
    id: value as T,
    label: key,
  }));
  return (
    <SelectField
      name={name}
      label={label}
      opts={opts}
      helperText={helperText}
      onChange={onChange}
      nullable={nullable}
    />
  );
};
