import { Accordion, AccordionDetails, AccordionSummary, Button, Divider, Stack } from "@mui/material";
import { Fragment } from "react";
import { FilterItemField } from "./filter-item-field.component";
import { useFieldArray, useFormContext } from "react-hook-form";
import { formFieldBorder } from "../../../utils/props";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

export type FilterListProps = {
  type: "exclude" | "include";
};
export const FilterList = ({ type }: FilterListProps) => {
  const filterName = type === "exclude" ? "Exclusion" : "Inclusion";
  const fieldArrayName = type === "exclude" ? "exclusionFilters" : "inclusionFilters";
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    name: fieldArrayName,
    control,
  });
  return (
    <Fragment>
      {fields.map((field, index) => (
        <Fragment>
          {index > 0 && <Divider>OR</Divider>}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              {filterName} Filter {index + 1}
            </AccordionSummary>
            <AccordionDetails>
              <Stack sx={{ ...formFieldBorder, gap: 1 }} key={field.id}>
                <FilterItemField parentFieldName={`${fieldArrayName}.${index}`} remove={() => remove(index)} />
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Fragment>
      ))}
      <Button onClick={() => append({})}>Add {filterName} Filter</Button>
    </Fragment>
  );
};
