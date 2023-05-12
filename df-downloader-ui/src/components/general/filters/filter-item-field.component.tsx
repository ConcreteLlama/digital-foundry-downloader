import { Button, Divider, Grid, Stack, Typography } from "@mui/material";
import { red } from "@mui/material/colors";
import { DfContentStatus, StringFilter, TagFilter } from "df-downloader-common";
import { Fragment, useEffect } from "react";
import { AutocompleteElement, CheckboxElement, MultiSelectElement } from "react-hook-form-mui";
import { useSelector } from "react-redux";
import { queryDfTags } from "../../../store/df-tags/df-tags.action";
import { selectDfTagNames } from "../../../store/df-tags/df-tags.selector";
import { store } from "../../../store/store";
import { ZodSelectField } from "../../zod-fields/zod-select-field.component";
import { ZodTextField } from "../../zod-fields/zod-text-field.component";
import { ContentFilterMode } from "./filter-list.component";

export type FilterItemFieldProps = {
  parentFieldName: string;
  remove?: () => void;
  mode: ContentFilterMode;
};
export const FilterItemField = ({ parentFieldName, remove, mode }: FilterItemFieldProps) => {
  return (
    <Fragment>
      <StringFilterField fieldName={`${parentFieldName}.title`} label="Title" />
      <Divider>AND</Divider>
      <StringFilterField fieldName={`${parentFieldName}.description`} label="Description" />
      <Divider>AND</Divider>
      <TagFilterField fieldName={`${parentFieldName}.tags`} />
      {mode === "contentEntry" && (
        <Fragment>
          <Divider>AND</Divider>
          <ContentStatusField fieldName={`${parentFieldName}.status`} />
        </Fragment>
      )}
      {remove && (
        <Button variant="text" onClick={remove} sx={{ color: red[400] }}>
          Remove
        </Button>
      )}
    </Fragment>
  );
};

type StringFilterFieldProps = {
  label: string;
  fieldName: string;
};

const StringFilterField = ({ fieldName, label }: StringFilterFieldProps) => {
  return (
    <Stack sx={{ gap: 2 }}>
      <Typography>{label}</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <ZodTextField
            name={`${fieldName}.value`}
            label="Value"
            zodString={StringFilter.shape.value._def.innerType}
            sx={{ width: "100%" }}
          />
        </Grid>
        <Grid item xs={6} md={2}>
          <ZodSelectField name={`${fieldName}.mode`} label="Mode" zodEnum={StringFilter.shape.mode._def.innerType} />
        </Grid>
        <Grid item xs={6} md={2}>
          <CheckboxElement name={`${fieldName}.caseSensitive`} label="Case Sensitive" />
        </Grid>
      </Grid>
    </Stack>
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
    <Stack sx={{ gap: 2 }}>
      <Typography>Tags</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={10}>
          <AutocompleteElement name={`${fieldName}.tags`} label="Tag Names" options={availableTags} multiple={true} />
        </Grid>
        <Grid item xs={4} md={2}>
          <ZodSelectField name={`${fieldName}.mode`} label="Mode" zodEnum={TagFilter.shape.mode._def.innerType} />
        </Grid>
      </Grid>
    </Stack>
  );
};

type ContentStatusFieldProps = {
  fieldName: string;
};

export const ContentStatusField = ({ fieldName }: ContentStatusFieldProps) => {
  return (
    <Stack sx={{ gap: 2 }}>
      <Typography>Status</Typography>
      <MultiSelectElement name={fieldName} label="Status" options={Object.values(DfContentStatus)} showChips />
    </Stack>
  );
};

// type RemovabeFieldProps = {
//   fieldName: string;
//   label: string;
//   children: React.ReactNode;
// };

// const RemovabeField = ({ fieldName, label, children }: RemovabeFieldProps) => {
//   const context = useFormContext();
//   const initValue = context.getValues(fieldName);
//   const [visible, setVisible] = useState(Boolean(initValue));
//   if (visible) {
//     return (
//       <Fragment>
//         <Box sx={{ display: "flex", alignItems: "center" }}>
//           <Typography>{label} Filter</Typography>
//           <IconButton
//             onClick={() => {
//               setVisible(false);
//               context.setValue(fieldName, undefined, {
//                 shouldDirty: true,
//               });
//             }}
//           >
//             <DeleteIcon fontSize="small" />
//           </IconButton>
//         </Box>
//         {children}
//       </Fragment>
//     );
//   } else {
//     return <Button onClick={() => setVisible(true)}>Add {label} Filter</Button>;
//   }
// };
