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
        /*
         * Takes a whole row on a phone.
         *
         * It shares a flex row with seven toggle buttons, none of which will
         * shrink below their icons - so the only thing left to give was the
         * input, which collapsed to a couple of pixels and left the toolbar
         * looking like it had no search at all. Claiming the full width makes
         * the buttons wrap underneath instead.
         */
        minWidth: { xs: "100%", sm: 180 },
      }}
    />
  );
};
