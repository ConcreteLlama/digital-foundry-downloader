import { AppBar, Box, Button, List, ListItem, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { resetState, updateDfContentQuery } from "../../store/df-content/df-content.action";
import {
  selectDfContentEntryKeys,
  selectPageInfo,
  selectQueryTags,
  selectTotalContentItems,
} from "../../store/df-content/df-content.selector";
import { store } from "../../store/store";
import { MiddleModal } from "../general/middle-modal.component";
import { PageSelector } from "../general/page-selector.component";
import { DfContentInfoItemCard } from "./df-content-item-card.component";
import { DfContentInfoItemDetail } from "./df-content-item-detail.component";
import { DfSearch } from "./df-search-input.component";
import { DfTagBox } from "./df-tag-box.component";

export const DfContentInfoDirectory = () => {
  const contentKeys = useSelector(selectDfContentEntryKeys);
  const totalItems = useSelector(selectTotalContentItems);
  const { currentPage, numPages, limit } = useSelector(selectPageInfo);
  const [prevPage, setPrevPage] = useState(currentPage);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
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
      <Box sx={{ display: "flex", justifyContent: "space-between", paddingX: 4, gap: 2 }}>
        <DfSearch />
        <TagButton setSearchOpen={setSearchOpen} />
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
            <DfContentInfoItemCard
              dfContentName={contentKey}
              key={`df-content-card-${contentKey}`}
              onClick={() => setSelectedItem(contentKey)}
            />
          </ListItem>
        ))}
      </List>
      <MiddleModal open={Boolean(selectedItem)} onClose={() => setSelectedItem(null)}>
        <Box>
          <DfContentInfoItemDetail dfContentName={selectedItem || ""} />
        </Box>
      </MiddleModal>
      <MiddleModal open={searchOpen} onClose={() => setSearchOpen(false)}>
        <DfTagBox />
      </MiddleModal>
      <AppBar position="sticky" sx={{ top: "auto", bottom: 0 }}>
        <PageSelector
          currentPage={currentPage}
          numPages={numPages}
          onUpdatePage={(page) => store.dispatch(updateDfContentQuery({ page }))}
          buttonProps={{
            variant: "contained",
          }}
        />
      </AppBar>
    </Stack>
  );
};

// Going to get rid of this soon..
type TagButtonProps = {
  setSearchOpen: (open: boolean) => void;
};
const TagButton = ({ setSearchOpen }: TagButtonProps) => {
  const selectedTags = useSelector(selectQueryTags);
  return (
    <Button variant={selectedTags.length ? "contained" : "outlined"} onClick={() => setSearchOpen(true)}>
      {selectedTags.length > 0 ? `Tags (${selectedTags.length})` : "Tags"}
    </Button>
  );
};
