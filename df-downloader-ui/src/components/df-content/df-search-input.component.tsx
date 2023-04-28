import { Input } from "@mui/material";
import { updateDfContentInfoQuery } from "../../store/df-content/df-content.action";
import { store } from "../../store/store";

let searchInputTimer: ReturnType<typeof setTimeout>;

const tempSearchRemoveThis = (searchString: string) => {
  clearTimeout(searchInputTimer);
  searchInputTimer = setTimeout(() => {
    store.dispatch(updateDfContentInfoQuery({ search: searchString }));
  }, 500);
};

export const DfSearch = () => {
  return (
    <Input
      placeholder="Start typing to search for DF videos"
      onChange={(event) => tempSearchRemoveThis(event.target.value)}
      sx={{
        flexGrow: 3,
      }}
    />
  );
};
