import DeleteIcon from "@mui/icons-material/Delete";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { StringFilter, TagFilter } from "df-downloader-common";
import { Fragment, useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { AutocompleteElement, CheckboxElement } from "react-hook-form-mui";
import { useSelector } from "react-redux";
import { queryDfTags } from "../../../store/df-tags/df-tags.action";
import { store } from "../../../store/store";
import { formFieldBorder } from "../../../utils/props";
import { ZodSelectField } from "../../zod-fields/zod-select-field.component";
import { ZodTextField } from "../../zod-fields/zod-text-field.component";
import { selectDfTagNames } from "../../../store/df-tags/df-tags.selector";
import { red } from "@mui/material/colors";

export type FilterItemFieldProps = {
  parentFieldName: string;
  remove: () => void;
};
export const FilterItemField = ({ parentFieldName, remove }: FilterItemFieldProps) => {
  return (
    <Fragment>
      <StringFilterField fieldName={`${parentFieldName}.title`} label="Title" />
      <StringFilterField fieldName={`${parentFieldName}.description`} label="Description" />
      <TagFilterField fieldName={`${parentFieldName}.tags`} />
      <Button variant="text" onClick={remove} sx={{ color: red[400] }}>
        Remove
      </Button>
    </Fragment>
  );
};

type RemovabeFieldProps = {
  fieldName: string;
  label: string;
  children: React.ReactNode;
};

const RemovabeField = ({ fieldName, label, children }: RemovabeFieldProps) => {
  const context = useFormContext();
  const initValue = context.getValues(fieldName);
  const [visible, setVisible] = useState(Boolean(initValue));
  if (visible) {
    return (
      <Fragment>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Typography>{label} Filter</Typography>
          <IconButton onClick={() => setVisible(false)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
        {children}
      </Fragment>
    );
  } else {
    return <Button onClick={() => setVisible(true)}>Add {label} Filter</Button>;
  }
};

type StringFilterFieldProps = {
  label: string;
  fieldName: string;
};

const StringFilterField = ({ fieldName, label }: StringFilterFieldProps) => {
  return (
    <RemovabeField label={label} fieldName={fieldName}>
      <Stack sx={{ ...formFieldBorder, gap: 1 }}>
        <ZodTextField name={`${fieldName}.value`} label="Value" zodString={StringFilter.shape.value._def.innerType} />
        <ZodSelectField name={`${fieldName}.mode`} label="Mode" zodEnum={StringFilter.shape.mode._def.innerType} />
        <CheckboxElement name={`${fieldName}.caseSensitive`} label="Case Sensitive" />
      </Stack>
    </RemovabeField>
  );
};

type TagFilterFieldProps = {
  fieldName: string;
};
const TagFilterField = ({ fieldName }: TagFilterFieldProps) => {
  useEffect(() => {
    store.dispatch(queryDfTags.start());
  }, []);
  const availableTags = useSelector(selectDfTagNames);
  return (
    <RemovabeField label="Tags" fieldName={fieldName}>
      <AutocompleteElement name={`${fieldName}.tags`} label="Tag Names" options={availableTags} multiple={true} />
      <ZodSelectField name={`${fieldName}.mode`} label="Mode" zodEnum={TagFilter.shape.mode} />
    </RemovabeField>
  );
};
