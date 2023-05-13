import { zodResolver } from "@hookform/resolvers/zod";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { DfContentEntrySearchBody } from "df-downloader-common";
import { Fragment, useState } from "react";
import { FormContainer } from "react-hook-form-mui";
import { FilterList } from "../general/filters/filter-list.component";
import { store } from "../../store/store";
import { resetDfContentQuery, updateDfContentQuery } from "../../store/df-content/df-content.action";
import { useSelector } from "react-redux";
import { selectCurrentQuery } from "../../store/df-content/df-content.selector";
import CloseIcon from "@mui/icons-material/Close";

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
      <DialogTitle>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6">Advanced Search</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
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
            <Box
              component={Button}
              type="submit"
              id="submit-search"
              hidden={true}
              onClick={() => {
                store.dispatch(resetDfContentQuery());
                onClose();
              }}
            />
          </Stack>
        </FormContainer>
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
        <Button
          variant="contained"
          type="submit"
          onClick={() => {
            // If this seems weird it's because it is. Really the whole thing should be wrapped in FormContainer,
            // but if the whole Dialog is wrapped in it, submit doesn't work, and if everything within the Dialog
            // is wrapped in it, the DialogActions don't stick to the bottom of the dialog
            // So we have a hidden button in the form itself and click it with this button. Sneaky beaky.
            const submitButton = document.querySelector("#submit-search") as HTMLButtonElement;
            submitButton.click();
          }}
        >
          Search
        </Button>
      </DialogActions>
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
