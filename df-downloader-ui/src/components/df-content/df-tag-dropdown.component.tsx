import { Autocomplete, SxProps, TextField } from "@mui/material";
import { useSelector } from "react-redux";
import { selectDfTags, selectSelectedTags } from "../../store/df-tags/df-tags.selector";

export type DfTagDropdownProps = {
  onChange: (tags: string[]) => void;
  sx?: SxProps;
};

export const DfTagDropdown = ({ onChange, sx }: DfTagDropdownProps) => {
  const tags = useSelector(selectDfTags);
  const selectedTags = useSelector(selectSelectedTags);
  return (
    <Autocomplete
      multiple
      options={tags}
      defaultValue={selectedTags}
      getOptionLabel={(option) => `${option.tag} (${option.count})`}
      renderInput={(params) => <TextField {...params} label="Tags" />}
      sx={sx}
      onChange={(event, value) => {
        onChange(value.map((tag) => tag.tag));
      }}
    />
  );
};
