import { Input } from "@mui/material";
import { updateDfContentQuery } from "../../store/df-content/df-content.action";
import { store } from "../../store/store";

let searchInputTimer: ReturnType<typeof setTimeout>;

const quickSearch = (searchString: string) => {
  clearTimeout(searchInputTimer);
  searchInputTimer = setTimeout(() => {
    store.dispatch(
      updateDfContentQuery({
        filter: {
          include: {
            title: searchString,
          },
        },
      })
    );
  }, 500);
};

export type DfQuickSearchProps = {
  clear: boolean;
  setClear(clear: boolean): void;
};
export const DfQuickSearch = ({ clear, setClear }: DfQuickSearchProps) => {
  return (
    <Input
      placeholder="Start typing to search for DF videos"
      value={clear ? "" : undefined}
      onChange={(event) => {
        quickSearch(event.target.value);
        setClear(false);
      }}
      sx={{
        flexGrow: 3,
      }}
    />
  );
};
