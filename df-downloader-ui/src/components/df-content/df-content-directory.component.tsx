import { AppBar, Box, List, ListItem, Stack, Typography, useMediaQuery } from "@mui/material";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { resetState, updateDfContentQuery } from "../../store/df-content/df-content.action";
import {
  selectDfContentEntryKeys,
  selectPageInfo,
  selectTotalContentItems,
} from "../../store/df-content/df-content.selector";
import { store } from "../../store/store";
import { theme } from "../../themes/theme";
import { MiddleModal } from "../general/middle-modal.component";
import { PageSelector } from "../general/page-selector.component";
import { DfContentInfoItemCard } from "./df-content-item-card.component";
import { DfContentInfoItemDetail } from "./df-content-item-detail.component";
import { DfQuickSearch } from "./df-search-input.component";
import { ClearDfSearchButton, DfAdvancedSearchButton } from "./df-search.component";

export const DfContentInfoDirectory = () => {
  const contentKeys = useSelector(selectDfContentEntryKeys);
  const totalItems = useSelector(selectTotalContentItems);
  const resultsInTop = useMediaQuery(theme.breakpoints.up("md"));
  const { currentPage, numPages, limit } = useSelector(selectPageInfo);
  const [prevPage, setPrevPage] = useState(currentPage);
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
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "clip" }}>
      <Stack
        sx={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "background.default", gap: 1, paddingBottom: 1 }}
      >
        <TopBar />
        {resultsInTop && <SearchResultCounts totalItems={totalItems} currentPage={currentPage} limit={limit} />}
      </Stack>
      <Box
        sx={{
          flexGrow: 1,
          overflow: "auto",
          "::-webkit-scrollbar": {
            display: "none",
          },
        }}
      >
        <Stack sx={{ justifyItems: "center" }}>
          {!resultsInTop && <SearchResultCounts totalItems={totalItems} currentPage={currentPage} limit={limit} />}
          {contentKeys.length === 0 ? (
            <Typography
              sx={{
                textAlign: "center",
              }}
            >
              No results found
            </Typography>
          ) : (
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
          )}
          <MiddleModal open={Boolean(selectedItem)} onClose={() => setSelectedItem(null)}>
            <Box>
              <DfContentInfoItemDetail dfContentName={selectedItem || ""} />
            </Box>
          </MiddleModal>
        </Stack>
      </Box>
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
    </Box>
  );
};

const TopBar = () => {
  const [quickSearchClear, setQuickSearchClear] = useState(false);
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", paddingX: 4, gap: 2 }}>
      <DfQuickSearch clear={quickSearchClear} setClear={setQuickSearchClear} />
      <DfAdvancedSearchButton onClick={() => setQuickSearchClear(true)} />
      <ClearDfSearchButton onClick={() => setQuickSearchClear(true)} />
    </Box>
  );
};

type SearchResultCountsProps = {
  totalItems: number;
  currentPage: number;
  limit: number;
};
const SearchResultCounts = ({ totalItems, currentPage, limit }: SearchResultCountsProps) => (
  <Typography
    sx={{
      textAlign: "center",
    }}
  >
    Showing {limit * (currentPage - 1) + 1} to {Math.min(limit * currentPage, totalItems)} of {totalItems}
  </Typography>
);
