import { Box, IconButton } from "@mui/material";
import { SelectElement, useFormContext } from "react-hook-form-mui";
import { z } from "zod";
import ClearIcon from "@mui/icons-material/Clear";
import { useState } from "react";

export type ZodSelectFieldProps<T extends [string, ...string[]]> = {
  name: string;
  label: string;
  helperText?: string;
  zodEnum: z.ZodEnum<T>;
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
  const formContext = useFormContext();
  // This is a little hacky, probably better way to do it
  const initValue = formContext.getValues()[name];
  const [currentValue, setCurrentValue] = useState(initValue);
  onChange && onChange(initValue);
  const opts = Object.entries(zodEnum.Values).map(([key, value]) => ({
    id: value,
    label: key,
  }));
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
