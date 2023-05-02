import { Button, Stack } from "@mui/material";
import { Fragment } from "react";
import { FilterItemField } from "./filter-item-field.component";
import { useFieldArray, useFormContext } from "react-hook-form";
import { formFieldBorder } from "../../../utils/props";

export type FilterListProps = {
  type: "exclude" | "include";
};
export const FilterList = ({ type }: FilterListProps) => {
  const filterName = type === "exclude" ? "Exclusion" : "Inclusion";
  const fieldArrayName = type === "exclude" ? "exclusionFilter" : "inclusionFilter";
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    name: fieldArrayName,
    control,
  });
  return (
    <Fragment>
      {fields.map((field, index) => (
        <Stack sx={{ ...formFieldBorder, gap: 1 }} key={field.id}>
          <FilterItemField parentFieldName={`${fieldArrayName}.${index}`} remove={() => remove(index)} />
        </Stack>
      ))}
      <Button onClick={() => append({})}>Add {filterName} Filter</Button>
    </Fragment>
  );
};
