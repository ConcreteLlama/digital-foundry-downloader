import { Fragment, useEffect, useState } from "react";
import { OrderableListFormField } from "../general/ordered-list-form-field.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { AutomaticDownloadsConfig } from "df-downloader-common/config/automatic-downloads-config";
import { AutocompleteElement, CheckboxElement, useFieldArray, useFormContext, useWatch } from "react-hook-form-mui";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import { StringFilter, TagFilter } from "df-downloader-common";
import { ZodSelectField } from "../zod-fields/zod-select-field.component";
import { store } from "../../store/store";
import { queryDfTags } from "../../store/df-tags/df-tags.action";
import { useSelector } from "react-redux";
import { selectDfTagNames } from "../../store/df-tags/df-tags.selector";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { formFieldBorder } from "../../utils/props";

export const AutomaticDownloadsSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="automaticDownloads" title="Automatic Downloads">
      <AutoConfigSettings />
    </DfSettingsSectionForm>
  );
};

const AutoConfigSettings = () => {
  const enabled = useWatch<AutomaticDownloadsConfig>({
    name: "enabled",
  });
  return (
    <Fragment>
      <CheckboxElement
        name="enabled"
        label="Enable Automatic Downloads"
        helperText="Whether automatic downloads are enabled"
      />
      {enabled && (
        <Fragment>
          <ZodNumberField
            name="downloadDelay"
            label="Download Delay"
            helperText="Delay after detecting new content before starting the download (in milliseconds)"
            zodNumber={AutomaticDownloadsConfig.shape.downloadDelay._def.innerType}
          />
          <OrderableListFormField name="mediaTypes" label="Media Type Priorities" extendable={false} />
          <ExclusionFilters />
        </Fragment>
      )}
    </Fragment>
  );
};

const ExclusionFilters = () => {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    name: "exclusionFilters",
    control,
  });
  return (
    <Fragment>
      {fields.map((field, index) => (
        <Stack sx={{ ...formFieldBorder, gap: 1 }} key={field.id}>
          <AutoDownloadFilterItemField parentFieldName={`exclusionFilters.${index}`} remove={() => remove(index)} />
        </Stack>
      ))}
      <Button onClick={() => append({})}>Add Exclusion Filter</Button>
    </Fragment>
  );
};

type AutoDownloadFilterItemFieldProps = {
  parentFieldName: string;
  remove: () => void;
};
const AutoDownloadFilterItemField = ({ parentFieldName, remove }: AutoDownloadFilterItemFieldProps) => {
  return (
    <Fragment>
      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Typography variant="h6">Exclusion Filter</Typography>
        <IconButton onClick={() => remove()}>
          <DeleteIcon />
        </IconButton>
      </Box>
      <StringFilterField fieldName={`${parentFieldName}.title`} label="Title" />
      <StringFilterField fieldName={`${parentFieldName}.description`} label="Description" />
      <TagFilterField fieldName={`${parentFieldName}.tags`} />
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
        <Box sx={{ display: "flex" }}>
          <Typography variant="h6">{label} Filter</Typography>
          <IconButton onClick={() => setVisible(false)}>
            <DeleteIcon />
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
