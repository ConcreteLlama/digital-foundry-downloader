import { AppBar, Box, Button, List, ListItem, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import {
  resetState,
  setSearchOpen,
  setSelectedItem,
  updateDfContentInfoQuery,
} from "../../store/df-content/df-content.action";
import {
  selectDfContentEntryKeys,
  selectPageInfo,
  selectQueryTags,
  selectSearchOpenState,
  selectSelectedContentItem,
  selectTotalContentItems,
} from "../../store/df-content/df-content.selector";
import { store } from "../../store/store";
import { DfContentInfoItemCard } from "./df-content-item-card.component";
import { DfContentInfoItemDetail } from "./df-content-item-detail.component";
import { DfSearch } from "./df-search-input.component";
import { DfTagBox } from "./df-tag-box.component";
import { MiddleModal } from "../general/middle-modal.component";
import { PageSelector } from "../general/page-selector.component";

export const DfContentInfoDirectory = () => {
  const contentKeys = useSelector(selectDfContentEntryKeys);
  const totalItems = useSelector(selectTotalContentItems);
  const { currentPage, numPages, limit } = useSelector(selectPageInfo);
  const [prevPage, setPrevPage] = useState(currentPage);
  const selectedItem = useSelector(selectSelectedContentItem);
  const searchOpen = useSelector(selectSearchOpenState);
  useEffect(() => {
    return () => {
      store.dispatch(resetState);
    };
  }, []);
  if (prevPage !== currentPage) {
    setPrevPage(currentPage);
    window.scrollTo(0, 0);
  }
  return (
    <Stack sx={{ justifyItems: "center", marginTop: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", paddingX: 4 }}>
        <DfSearch />
        <TagButton />
      </Box>
      <Box>
        <Typography
          sx={{
            textAlign: "center",
          }}
        >
          Showing {limit * (currentPage - 1) + 1} to {Math.min(limit * currentPage, totalItems)} of {totalItems}
        </Typography>
      </Box>
      <List sx={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {contentKeys.map((contentKey) => (
          <ListItem key={`df-content-list-item-${contentKey}`} sx={{ display: "flex", justifyContent: "center" }}>
            <DfContentInfoItemCard dfContentName={contentKey} key={`df-content-card-${contentKey}`} />
          </ListItem>
        ))}
      </List>
      <MiddleModal open={Boolean(selectedItem)} onClose={() => store.dispatch(setSelectedItem(null))}>
        <Box>
          <DfContentInfoItemDetail dfContentName={selectedItem || ""} />
        </Box>
      </MiddleModal>
      <MiddleModal open={searchOpen} onClose={() => store.dispatch(setSearchOpen(false))}>
        <DfTagBox />
      </MiddleModal>
      <AppBar position="sticky" sx={{ top: "auto", bottom: 0 }}>
        <PageSelector
          currentPage={currentPage}
          numPages={numPages}
          onUpdatePage={(page) => store.dispatch(updateDfContentInfoQuery({ page }))}
          buttonProps={{
            variant: "contained",
          }}
        />
      </AppBar>
    </Stack>
  );
};

const TagButton = () => {
  const selectedTags = useSelector(selectQueryTags);
  return (
    <Button
      variant={selectedTags.length ? "contained" : "outlined"}
      onClick={() => store.dispatch(setSearchOpen(true))}
    >
      {selectedTags.length > 0 ? `Tags (${selectedTags.length})` : "Tags"}
    </Button>
  );
};
