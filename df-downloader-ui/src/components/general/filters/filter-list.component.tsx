import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Divider,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { Fragment, useState } from "react";
import { FilterItemField } from "./filter-item-field.component";
import { useFieldArray, useFormContext } from "react-hook-form";
import { formFieldBorder } from "../../../utils/props";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";

export type ContentFilterMode = "contentInfo" | "contentEntry";

export type FilterListProps = {
  filterName: string;
  fieldArrayName: string;
  defaultExpandedState?: boolean;
  mode?: ContentFilterMode;
  min?: number;
};
export const FilterList = ({
  filterName,
  fieldArrayName,
  defaultExpandedState,
  min = 0,
  mode = "contentInfo",
}: FilterListProps) => {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    name: fieldArrayName,
    control,
  });
  return (
    <Fragment>
      {fields.map((field, index) => (
        <FilterAccordian
          filterName={filterName}
          fieldArrayName={fieldArrayName}
          defaultExpandedState={defaultExpandedState}
          fieldId={field.id}
          index={index}
          remove={fields.length > min ? remove : undefined}
          mode={mode}
        />
      ))}
      <Button onClick={() => append({})}>Add {filterName} Filter</Button>
    </Fragment>
  );
};

type FilterAccordianProps = {
  filterName: string;
  fieldArrayName: string;
  fieldId: string;
  defaultExpandedState?: boolean;
  index: number;
  remove?: (index: number) => void;
  mode: ContentFilterMode;
};
const FilterAccordian = ({
  filterName,
  fieldArrayName,
  defaultExpandedState,
  index,
  fieldId,
  mode,
  remove,
}: FilterAccordianProps) => {
  const [expanded, setExpanded] = useState<boolean>(defaultExpandedState ?? false);
  const toggleExpanded = () => setExpanded((prev) => !prev);
  return (
    <Fragment>
      {index > 0 && <Divider>OR</Divider>}
      <Accordion expanded={expanded}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} onClick={toggleExpanded}>
          <Box sx={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography>
              {filterName} Filter {index + 1}
            </Typography>
            {remove && (
              <IconButton onClick={() => remove(index)} sx={{ marginRight: 2 }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack sx={{ ...formFieldBorder, gap: 1 }} key={fieldId}>
            <FilterItemField
              parentFieldName={`${fieldArrayName}.${index}`}
              remove={remove && (() => remove(index))}
              mode={mode}
            />
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Fragment>
  );
};
