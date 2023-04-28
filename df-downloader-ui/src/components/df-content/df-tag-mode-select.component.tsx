import { useSelector } from "react-redux";
import { selectTagQueryMode } from "../../store/df-content/df-content.selector";
import { MenuItem, Select } from "@mui/material";
import { store } from "../../store/store";
import { updateDfContentInfoQuery } from "../../store/df-content/df-content.action";

export const DfTagModeSelect = () => {
  const tagMode = useSelector(selectTagQueryMode);
  return (
    <Select
      variant="standard"
      defaultValue={tagMode}
      onChange={(event) =>
        store.dispatch(updateDfContentInfoQuery({ tagMode: event.target.value === "and" ? "and" : "or" }))
      }
    >
      <MenuItem value={"or"}>Or</MenuItem>
      <MenuItem value={"and"}>And</MenuItem>
    </Select>
  );
};
