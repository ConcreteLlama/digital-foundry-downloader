import GridViewIcon from "@mui/icons-material/GridView";
import ViewListIcon from "@mui/icons-material/ViewList";
import DensitySmallIcon from "@mui/icons-material/DensitySmall";
import DensityMediumIcon from "@mui/icons-material/DensityMedium";
import ViewComfyIcon from "@mui/icons-material/ViewComfy";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import { Box, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { queryConfigSection } from "../../../store/config/config.action.ts";
import { selectConfigLoading } from "../../../store/config/config.selector.ts";
import { resetState, updateDfContentQuery } from "../../../store/df-content/df-content.action.ts";
import {
  selectDfContentEntryCurrentKeys,
  selectPageInfo,
  selectTotalContentItems,
} from "../../../store/df-content/df-content.selector.ts";
import { selectIsLoading } from "../../../store/general.selector.ts";
import { store } from "../../../store/store.ts";
import { monoFontFamily } from "../../../themes/build-theme.ts";
import {
  ContentView,
  getStoredDensity,
  getStoredView,
  RowDensity,
  storeDensity,
  storeView,
} from "../../../themes/ui-preferences.ts";
import { Loading } from "../../general/loading.component.tsx";
import { MiddleModal } from "../../general/middle-modal.component.tsx";
import { NumericPagination } from "../../general/numeric-pagination.component.tsx";
import { DfSessionCheckDialog } from "../../settings/df-session-check-dialog.component.tsx";
import { ActiveFilterChips } from "../active-filter-chips.component.tsx";
import { ContentGridCard } from "../content-row/content-grid-card.component.tsx";
import { ContentRow } from "../content-row/content-row.component.tsx";
import { DfContentInfoItemDetail } from "../df-content-item-detail/df-content-item-detail.component.tsx";
import { DfQuickSearch } from "../df-search-input.component.tsx";
import { ClearDfSearchButton, DfAdvancedSearchButton } from "../df-search.component.tsx";

export const DfContentInfoDirectory = () => {
  useEffect(() => {
    store.dispatch(queryConfigSection.start("mediaFormats"));
  }, []);
  const theme = useTheme();
  const belowMd = useMediaQuery(theme.breakpoints.down("md"));
  const contentKeys = useSelector(selectDfContentEntryCurrentKeys);
  const contentLoading = useSelector(selectIsLoading("dfContent"));
  const configLoading = useSelector(selectConfigLoading);
  const loading = contentLoading || configLoading;
  const totalItems = useSelector(selectTotalContentItems);
  const { currentPage, numPages, limit } = useSelector(selectPageInfo);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const onModalClose = () => setSelectedItem(null);
  const [density, setDensity] = useState<RowDensity>(() => getStoredDensity());
  const [view, setView] = useState<ContentView>(() => getStoredView());

  // The document itself never scrolls - this Box is the scroll container (it's
  // height:100% of #main-app-scroll, which is the viewport minus the AppBar).
  // The old window.scrollTo(0, 0) here therefore did nothing on a page change,
  // leaving you halfway down the new page.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    return () => {
      store.dispatch(resetState());
    };
  }, []);
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [currentPage]);

  const applyDensity = (next: RowDensity) => {
    storeDensity(next);
    setDensity(next);
  };
  const applyView = (next: ContentView) => {
    storeView(next);
    setView(next);
  };

  return (
    <Box
      id="df-content-directory"
      ref={scrollContainerRef}
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "auto",
        "::-webkit-scrollbar": {
          display: "none",
        },
      }}
    >
      <DfSessionCheckDialog />
      <Stack
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          backgroundColor: "background.default",
          gap: 0.5,
          paddingBottom: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <TopBar density={density} onDensity={applyDensity} view={view} onView={applyView} compact={belowMd} />
        <ActiveFilterChips />
        <ResultCount totalItems={totalItems} currentPage={currentPage} limit={limit} />
      </Stack>

      <Box sx={{ flexGrow: 1 }}>
        {contentKeys.length === 0 ? (
          loading ? (
            <Loading />
          ) : (
            <Typography sx={{ textAlign: "center", paddingY: 6, color: "text.secondary" }}>No results found</Typography>
          )
        ) : view === "grid" ? (
          <Box
            sx={{
              display: "grid",
              // Density means "how much fits on screen" in both views - it
              // sizes the cards here rather than doing nothing, which is what
              // it did while the track was a fixed 190px.
              gridTemplateColumns: `repeat(auto-fill, minmax(${density === "compact" ? 150 : 190}px, 1fr))`,
              gap: density === "compact" ? 1 : 1.5,
              padding: { xs: 1, md: 2 },
            }}
          >
            {contentKeys.map((contentKey) => (
              <ContentGridCard
                key={`df-content-card-${contentKey}`}
                dfContentName={contentKey}
                onClick={() => setSelectedItem(contentKey)}
              />
            ))}
          </Box>
        ) : (
          <Box>
            {contentKeys.map((contentKey) => (
              <ContentRow
                key={`df-content-row-${contentKey}`}
                dfContentName={contentKey}
                density={density}
                onClick={() => setSelectedItem(contentKey)}
              />
            ))}
          </Box>
        )}
        <MiddleModal
          open={Boolean(selectedItem)}
          onClose={onModalClose}
          id="df-content-item-detail-modal"
          hideCloseButton
        >
          <Box>
            <DfContentInfoItemDetail dfContentName={selectedItem || ""} onClose={onModalClose} />
          </Box>
        </MiddleModal>
      </Box>

      {/* Sticky at the bottom for the same reason the top bar is sticky at the
          top: this sits after a naturally tall list of up to `limit` items in
          a scrolling flex column, so without this it's only reachable by
          scrolling past the entire current page's content first - which reads
          as "there's no pagination" rather than "it's further down." */}
      <Box
        sx={{
          position: "sticky",
          bottom: 0,
          zIndex: 1,
          backgroundColor: "background.default",
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <NumericPagination
          currentPage={currentPage}
          numPages={numPages}
          onUpdatePage={(page) => store.dispatch(updateDfContentQuery({ page }))}
        />
      </Box>
    </Box>
  );
};

type TopBarProps = {
  density: RowDensity;
  onDensity: (density: RowDensity) => void;
  view: ContentView;
  onView: (view: ContentView) => void;
  compact: boolean;
};

const TopBar = ({ density, onDensity, view, onView, compact }: TopBarProps) => {
  const [quickSearchClear, setQuickSearchClear] = useState(false);
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        paddingX: { xs: 1, md: 2 },
        paddingTop: 1,
        gap: 1,
      }}
    >
      <DfQuickSearch clear={quickSearchClear} setClear={setQuickSearchClear} />
      <DfAdvancedSearchButton onClick={() => setQuickSearchClear(true)} />
      <ClearDfSearchButton onClick={() => setQuickSearchClear(true)} />
      {/* Shown at every width: hiding these below md meant a phone that
          landed in grid view had no way back out of it. Density is desktop-only
          because the mobile row has a single density. */}
      <>
        {!compact && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={density}
            onChange={(_, next) => next && onDensity(next)}
            sx={{ marginLeft: 1 }}
          >
            {/* One preference, but it has to look like it means what it does
                in the view you are actually in - stacked-line icons offering
                "comfortable rows" while you are looking at a grid of cards
                read as broken, because in the grid they genuinely were. */}
            {(view === "grid"
              ? ([
                  { value: "comfortable", Icon: ViewModuleIcon, label: "Larger cards" },
                  { value: "compact", Icon: ViewComfyIcon, label: "Smaller cards" },
                ] as const)
              : ([
                  { value: "comfortable", Icon: DensityMediumIcon, label: "Comfortable rows" },
                  { value: "compact", Icon: DensitySmallIcon, label: "Compact rows" },
                ] as const)
            ).map(({ value, Icon, label }) => (
              <ToggleButton key={value} value={value} sx={{ paddingY: 0.25 }}>
                <Tooltip title={label}>
                  <Icon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, next) => next && onView(next)}>
            <ToggleButton value="list" sx={{ paddingY: 0.25 }}>
              <Tooltip title="List">
                <ViewListIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          <ToggleButton value="grid" sx={{ paddingY: 0.25 }}>
            <Tooltip title="Grid">
              <GridViewIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </>
    </Box>
  );
};

type ResultCountProps = {
  totalItems: number;
  currentPage: number;
  limit: number;
};
const ResultCount = ({ totalItems, currentPage, limit }: ResultCountProps) => (
  <Typography
    sx={{
      paddingX: { xs: 1, md: 2 },
      fontFamily: monoFontFamily,
      fontSize: "0.6875rem",
      color: "text.disabled",
    }}
  >
    {totalItems === 0
      ? "no results"
      : `${limit * (currentPage - 1) + 1}–${Math.min(limit * currentPage, totalItems)} of ${totalItems}`}
  </Typography>
);
