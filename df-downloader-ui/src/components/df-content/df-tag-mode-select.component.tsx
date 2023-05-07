import { useSelector } from "react-redux";
import { selectTagQueryMode } from "../../store/df-content/df-content.selector";
import { MenuItem, Select } from "@mui/material";
import { store } from "../../store/store";
import { updateDfContentQuery } from "../../store/df-content/df-content.action";

export const DfTagModeSelect = () => {
  const tagMode = useSelector(selectTagQueryMode);
  return (
    <Select
      variant="outlined"
      defaultValue={tagMode}
      onChange={(event) =>
        store.dispatch(updateDfContentQuery({ tagMode: event.target.value === "and" ? "and" : "or" }))
      }
    >
      <MenuItem value={"or"}>Or</MenuItem>
      <MenuItem value={"and"}>And</MenuItem>
    </Select>
  );
};
