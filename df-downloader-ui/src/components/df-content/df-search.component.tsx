import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from "@mui/material";
import { DfContentEntrySearchBody } from "df-downloader-common";
import { Fragment, useState } from "react";
import { FormContainer } from "react-hook-form-mui";
import { FilterList } from "../general/filters/filter-list.component";
import { store } from "../../store/store";
import { resetDfContentQuery, updateDfContentQuery } from "../../store/df-content/df-content.action";
import { useSelector } from "react-redux";
import { selectCurrentQuery } from "../../store/df-content/df-content.selector";

export type DfAdvancedSearchProps = {
  open: boolean;
  onClose: () => void;
};

export const DfAdvancedSearch = ({ open, onClose }: DfAdvancedSearchProps) => {
  const currentSearchValues = useSelector(selectCurrentQuery);
  const currentInclude = currentSearchValues?.filter?.include;
  const defaultFilter =
    !currentInclude || (Array.isArray(currentInclude) && currentInclude.length === 0)
      ? {
          include: [{}],
          exclude: [],
        }
      : currentSearchValues.filter;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={"lg"}>
      <FormContainer
        resolver={zodResolver(DfContentEntrySearchBody)}
        onSuccess={(data) => {
          console.log("success", data);
          store.dispatch(updateDfContentQuery(data));
          onClose();
        }}
        onError={(error) => {
          console.log("error!", error);
        }}
        defaultValues={{
          filter: defaultFilter,
        }}
      >
        <DialogTitle>Advanced Search</DialogTitle>
        <DialogContent>
          <Stack>
            <FilterList
              filterName="Inclusion"
              fieldArrayName="filter.include"
              defaultExpandedState={true}
              min={1}
              mode="contentEntry"
            />
            <FilterList
              filterName="Exclusion"
              fieldArrayName="filter.exclude"
              defaultExpandedState={true}
              mode="contentEntry"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              store.dispatch(resetDfContentQuery());
              onClose();
            }}
          >
            Clear
          </Button>
          <Button variant="contained" type="submit">
            Search
          </Button>
        </DialogActions>
      </FormContainer>
    </Dialog>
  );
};

export type DfAdvancedSearchButtonProps = {
  onClick?: () => void;
};
export const DfAdvancedSearchButton = ({ onClick }: DfAdvancedSearchButtonProps) => {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <Button
        onClick={() => {
          onClick && onClick();
          setOpen(true);
        }}
      >
        Search
      </Button>
      <DfAdvancedSearch open={open} onClose={() => setOpen(false)} />
    </Fragment>
  );
};

export type ClearDfSearchButtonProps = {
  onClick?: () => void;
};
export const ClearDfSearchButton = ({ onClick }: ClearDfSearchButtonProps) => {
  const currentSearchValues = useSelector(selectCurrentQuery);
  const { include, exclude } = currentSearchValues?.filter || {};
  const disabled =
    (!include || (Array.isArray(include) && include.length === 0)) &&
    (!exclude || (Array.isArray(exclude) && exclude.length === 0));
  return (
    <Button
      disabled={disabled}
      onClick={() => {
        store.dispatch(resetDfContentQuery());
        onClick && onClick();
      }}
    >
      Clear
    </Button>
  );
};
