import CloseIcon from "@mui/icons-material/Close";
import HorizontalSplitIcon from "@mui/icons-material/HorizontalSplit";
import VerticalSplitIcon from "@mui/icons-material/VerticalSplit";
import {
  Box,
  Button,
  IconButton,
  Stack,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DfContentInfoUtils, secondsToHHMMSS } from "df-downloader-common";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { AiAnalysisConfigUtils } from "df-downloader-common/config/ai-analysis-config";
import { selectConfigSection } from "../../../store/config/config.selector.ts";
import { queryConfigSection } from "../../../store/config/config.action.ts";
import { clearPipeline } from "../../../api/tasks.ts";
import { useDfContentEntry } from "../../../hooks/use-df-content-entry.ts";
import { useSwipeNavigation } from "../../../hooks/use-swipe-navigation.ts";
import { useViewportHeight } from "../../../hooks/use-viewport-height.ts";
import { fetchYtVideoMeta, refreshDfContentMeta } from "../../../store/df-content/df-content.action.ts";
import { selectQueryPipelineIds } from "../../../store/df-tasks/tasks.selector.ts";
import { store } from "../../../store/store.ts";
import { formatDate } from "../../../utils/date.ts";
import { monoFontFamily } from "../../../themes/build-theme.ts";
import {
  DetailLayout,
  getStoredDetailLayout,
  storeDetailLayout,
} from "../../../themes/ui-preferences.ts";
import { Thumb } from "../../general/thumb.component.tsx";
import { YouTubeEmbed } from "../../general/youtube-embed.tsx";
import { AiAnalysisPanel } from "../ai-analysis/ai-analysis-panel.component.tsx";
import { DfArticleLink } from "../ai-analysis/df-article-link.component.tsx";
import { DfTagList } from "../df-tag-list.component.tsx";
import { OnDiskRows } from "../downloaded-info/on-disk-rows.component.tsx";
import { FormatRows } from "../media-info/format-rows.component.tsx";
import { PipelineInfoSummaryDetail } from "../queued-task-info.tsx";
import { ContentItemDetailContainer } from "./df-content-item-detail.styles.tsx";

export type DfContentInfoItemDetailProps = {
  dfContentName: string;
  /**
   * Supplied when this is the body of a modal. The close control then sits on
   * the title line with the layout toggle, rather than being pinned above the
   * panel by the modal - which left the whole band beside it empty.
   */
  onClose?: () => void;
};

type DetailTab = "content" | "files" | "analysis" | "article" | "activity";

/**
 * One tab's label, carrying its own state.
 *
 * The state marker is the thing that makes tabs safe here. Hiding a
 * section behind a label is only acceptable if the label says whether
 * there is anything behind it - otherwise a matched article or a
 * finished analysis is invisible until you happen to click, which is
 * worse than the cluttered stack this replaces.
 */
const TabLabel = ({
  label,
  count,
  marker,
}: {
  label: string;
  count?: number;
  marker?: "present" | "live";
}) => (
  <Stack direction="row" spacing={0.75} alignItems="center">
    <span>{label}</span>
    {count !== undefined && (
      <Box
        component="span"
        sx={{
          fontFamily: monoFontFamily,
          fontSize: "0.625rem",
          color: "text.disabled",
          border: 1,
          borderColor: "divider",
          paddingX: 0.4,
          lineHeight: 1.5,
        }}
      >
        {count}
      </Box>
    )}
    {marker && (
      <Box
        component="span"
        sx={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: "primary.main",
          // Only work actually in flight pulses. A steady dot means
          // "there is something here", which is a different claim.
          animation: marker === "live" ? "df-tab-pulse 1.8s ease-in-out infinite" : "none",
          "@keyframes df-tab-pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.25 } },
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      />
    )}
  </Stack>
);

/**
 * Keeps a panel in the tree while hiding it.
 *
 * Analysis and Article fetch their own data on mount and report back
 * whether they found anything, which is what drives their tab markers -
 * so they have to be mounted whether or not they are on screen. That
 * costs exactly what the old always-rendered stack cost, since both
 * sections used to fetch on every panel open anyway.
 *
 * Files and Activity render from data the parent already holds, so they
 * unmount freely.
 */
const TabPanel = ({
  active,
  keepMounted,
  children,
}: {
  active: boolean;
  keepMounted?: boolean;
  children: React.ReactNode;
}) => {
  if (!active && !keepMounted) {
    return null;
  }
  return (
    <Box role="tabpanel" hidden={!active} sx={{ display: active ? "block" : "none", minWidth: 0 }}>
      {children}
    </Box>
  );
};

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <Typography variant="overline" sx={{ display: "block" }}>
    {children}
  </Typography>
);

export const DfContentInfoItemDetail = ({ dfContentName, onClose }: DfContentInfoItemDetailProps) => {
  const dfContentEntry = useDfContentEntry(dfContentName);
  const theme = useTheme();
  const belowMd = useMediaQuery(theme.breakpoints.down("md"));
  const viewportHeight = useViewportHeight();
  /**
   * The fixed height, or nothing if the measurement is not believable.
   *
   * useViewportHeight reads window.innerHeight raw, which is zero in a
   * backgrounded or not-yet-laid-out context. Pinning the panel to a
   * fraction of zero collapses it to an unusable sliver, so an implausible
   * reading falls back to the old shrink-wrap behaviour instead - worse
   * than intended, but never broken.
   */
  const stableHeightPx = viewportHeight > 200 ? Math.round(viewportHeight * 0.94) : undefined;
  const [layout, setLayout] = useState<DetailLayout>(() => getStoredDetailLayout());
  const applyLayout = (next: DetailLayout) => {
    storeDetailLayout(next);
    setLayout(next);
  };
  useEffect(() => {
    store.dispatch(refreshDfContentMeta.start(dfContentName));
    // Description/duration aren't in the new site's own listing data at
    // all - fetched lazily from YouTube here (dialog open), not during
    // scans, and only once per entry (the service caches the result).
    store.dispatch(fetchYtVideoMeta.start(dfContentName));
  }, [dfContentName]);
  // Config sections are fetched per-consumer rather than all at once, so a
  // component that reads one has to ask for it - otherwise the selector
  // returns undefined for anyone who has not happened to open that
  // section's settings page, and the panel below reports the feature as
  // switched off when it is not.
  useEffect(() => {
    store.dispatch(queryConfigSection.start("aiAnalysis"));
  }, []);

  // Gates the panel on the feature actually being usable, so it explains
  // itself rather than offering an Analyse button that would fail on the
  // first request for want of a key.
  const aiAnalysisConfig = useSelector(selectConfigSection("aiAnalysis"));
  const aiAnalysisEnabled = AiAnalysisConfigUtils.isUsable(aiAnalysisConfig ?? undefined);

  const downloadingPipelineIds = useSelector(
    selectQueryPipelineIds({
      filter: {
        contentName: dfContentName,
        state: "downloading",
      },
    })
  );
  const postProcessingPipelineIds = useSelector(
    selectQueryPipelineIds({
      filter: {
        contentName: dfContentName,
        state: "post-processing",
      },
    })
  );
  const completedPipelineIds = useSelector(
    selectQueryPipelineIds({ filter: { contentName: dfContentName, state: "complete" } })
  );
  const pipelineIds = [...downloadingPipelineIds, ...postProcessingPipelineIds, ...completedPipelineIds];
  const liveCount = downloadingPipelineIds.length + postProcessingPipelineIds.length;
  const clearCompletedPipelines = () => {
    completedPipelineIds.forEach((pipelineId) => {
      clearPipeline(pipelineId);
    });
  };

  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [hasArticle, setHasArticle] = useState(false);
  // Stable, so the child effects that report state do not re-run on every
  // render of this panel.
  const reportAnalysis = useCallback((has: boolean) => setHasAnalysis(has), []);
  const reportArticle = useCallback((has: boolean) => setHasArticle(has), []);

  // Below md the grid is one column whatever the stored preference says,
  // so the media has nowhere else to live and needs a tab of its own.
  const stacked = belowMd || layout === "stacked";
  const downloadCount = dfContentEntry?.downloads.length ?? 0;

  const tabs = useMemo(() => {
    const list: { id: DetailTab; label: string; count?: number; marker?: "present" | "live" }[] = [];
    if (stacked) {
      list.push({ id: "content", label: "Content" });
    }
    list.push({ id: "files", label: "Files", count: downloadCount || undefined });
    list.push({ id: "analysis", label: "Analysis", marker: hasAnalysis ? "present" : undefined });
    list.push({ id: "article", label: "Article", marker: hasArticle ? "present" : undefined });
    // Only present while there is something to show. An empty Activity tab
    // would be a permanent reminder of nothing happening.
    if (pipelineIds.length) {
      list.push({
        id: "activity",
        label: "Activity",
        count: pipelineIds.length,
        marker: liveCount ? "live" : undefined,
      });
    }
    return list;
  }, [stacked, downloadCount, hasAnalysis, hasArticle, pipelineIds.length, liveCount]);

  // Content by default. In split there is no Content tab - the media is
  // permanently on the left - so the fallback below resolves this to
  // Files without needing to know the layout here.
  const [tab, setTab] = useState<DetailTab>("content");
  // Work in flight is the thing you opened the panel to see, so it wins
  // the opening tab - but only until you pick something else, hence the
  // dependency on the id rather than on liveCount.
  useEffect(() => {
    if (liveCount > 0) {
      setTab("activity");
    }
  }, [dfContentName, liveCount > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // The tab set changes with layout and with what is running, so the
  // selected one can stop existing underneath us - switching to split
  // removes Content, and a finished download removes Activity.
  const activeTab = tabs.some((entry) => entry.id === tab) ? tab : tabs[0].id;

  // Swiping moves to the neighbouring tab - see useSwipeNavigation for
  // why a plain horizontal drag is not enough to act on.
  const step = (delta: number) => {
    const index = tabs.findIndex((entry) => entry.id === activeTab);
    const next = index + delta;
    if (next >= 0 && next < tabs.length) {
      setTab(tabs[next].id);
    }
  };
  const swipe = useSwipeNavigation({ onNext: () => step(1), onPrevious: () => step(-1) });

  if (!dfContentEntry) {
    //TODO: Make this more sensible
    return <Typography>ERROR</Typography>;
  }
  const { contentInfo } = dfContentEntry;
  const { statusInfo } = dfContentEntry;
  const queuedContentAvailability = statusInfo.availability;

  const media = (
    <Box sx={{ minWidth: 0 }}>
      {contentInfo.youtubeVideoId ? (
        <YouTubeEmbed videoId={contentInfo.youtubeVideoId} width="100%" />
      ) : (
        <Thumb
          src={DfContentInfoUtils.getThumbnailUrl(contentInfo, 1200, 600)}
          alt={contentInfo.title}
          width="100%"
        />
      )}
      <DfTagList tags={contentInfo.tags || []} sx={{ justifyContent: "flex-start", marginTop: 2 }} />
      {/* Descriptions are prose with real paragraph breaks (YouTube-sourced
          ones especially - blurb, links, then a chapter list). HTML collapses
          those newlines by default, running it all into one block. */}
      <Typography variant="body2" sx={{ whiteSpace: "pre-line", marginTop: 2, color: "text.secondary" }}>
        {contentInfo.description}
      </Typography>
    </Box>
  );

  const tabStrip = (
    <Tabs
      value={activeTab}
      onChange={(_event, next: DetailTab) => setTab(next)}
      variant="scrollable"
      scrollButtons={false}
      sx={{
        minHeight: 36,
        borderBottom: 1,
        borderColor: "divider",
        "& .MuiTab-root": { minHeight: 36, paddingY: 0.5, textTransform: "none", fontSize: "0.8125rem" },
      }}
    >
      {tabs.map((entry) => (
        <Tab
          key={entry.id}
          value={entry.id}
          label={<TabLabel label={entry.label} count={entry.count} marker={entry.marker} />}
        />
      ))}
    </Tabs>
  );

  /*
    The panels behind the tabs. Files leads because on an item you have not
    downloaded it is the only thing you came for - which is also why what
    you can fetch and what you already have sit together rather than at
    opposite ends of a stack: they answer one question.
  */
  const panels = (
    <Stack
      spacing={2}
      sx={{ minWidth: 0, minHeight: 0, height: stableHeightPx ? "100%" : undefined }}
      {...swipe}
    >
      {tabStrip}

      {/*
        Scrolls inside a fixed region rather than growing the dialog.
        Tab contents differ enormously in height - an embed and a long
        description against a one-line article link - so a shrink-wrapping
        dialog resized every time you changed tab, which on a phone moved
        the tab strip itself out from under your thumb.
      */}
      <Box
        sx={{
          minHeight: 0,
          flex: stableHeightPx ? "1 1 auto" : undefined,
          overflowY: stableHeightPx ? "auto" : "visible",
          "::-webkit-scrollbar": { display: "none" },
        }}
      >
      {stacked && <TabPanel active={activeTab === "content"}>{media}</TabPanel>}

      <TabPanel active={activeTab === "files"}>
        <Stack spacing={3}>
          <Box>
            <SectionHeading>Available to download</SectionHeading>
            {queuedContentAvailability === "PAYWALLED" && (
              <Typography variant="body2" color="text.disabled" sx={{ marginTop: 1 }}>
                Paywalled - not in your tier
              </Typography>
            )}
            <FormatRows contentEntry={dfContentEntry} />
          </Box>
          <Box>
            <SectionHeading>
              On disk
              {downloadCount > 0 ? ` · ${downloadCount} file${downloadCount === 1 ? "" : "s"}` : ""}
            </SectionHeading>
            {downloadCount > 0 ? (
              <OnDiskRows contentEntry={dfContentEntry} />
            ) : (
              <Typography variant="body2" color="text.disabled" sx={{ marginTop: 1 }}>
                Nothing downloaded yet
              </Typography>
            )}
          </Box>
        </Stack>
      </TabPanel>

      <TabPanel active={activeTab === "analysis"} keepMounted>
        <AiAnalysisPanel
          contentKey={dfContentEntry.key}
          enabled={aiAnalysisEnabled}
          onHasContent={reportAnalysis}
        />
      </TabPanel>

      <TabPanel active={activeTab === "article"} keepMounted>
        <DfArticleLink contentKey={dfContentEntry.key} onHasContent={reportArticle} />
      </TabPanel>

      <TabPanel active={activeTab === "activity"}>
        <Stack spacing={1}>
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              size="small"
              variant="outlined"
              onClick={clearCompletedPipelines}
              disabled={!completedPipelineIds.length}
            >
              Clear completed
            </Button>
          </Box>
          {pipelineIds.map((pipelineId) => (
            <PipelineInfoSummaryDetail
              key={`cid-pipeline-info-summary-detail${pipelineId}`}
              pipelineId={pipelineId}
            />
          ))}
        </Stack>
      </TabPanel>
      </Box>
    </Stack>
  );

  return (
    <ContentItemDetailContainer
      sx={
        stableHeightPx
          ? stacked
            ? // Matches the modal's own ceiling, so the panel fills it rather
              // than the modal sizing itself to the panel.
              { height: `${stableHeightPx}px`, maxHeight: `${stableHeightPx}px` }
            : // Split caps rather than fills: its height is set by the media
              // and description, which do not change with the tab, so a short
              // item should still get a short dialog. The cap is what gives
              // the two columns a definite height to scroll within.
              { maxHeight: `${stableHeightPx}px` }
          : undefined
      }
    >
      {/* Title, layout toggle and close on one line - all three are chrome for
          this panel, and stacking them cost a band of empty space the width of
          the dialog. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
          marginBottom: 2,
        }}
      >
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography variant="h5" sx={{ marginBottom: 0.5 }}>
            {contentInfo.title}
          </Typography>
          {/* One tabular identity line rather than three scattered captions. */}
          <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", color: "text.disabled" }}>
            {[
              formatDate(contentInfo.publishedDate),
              DfContentInfoUtils.getDurationSeconds(contentInfo) > 0
                ? secondsToHHMMSS(DfContentInfoUtils.getDurationSeconds(contentInfo))
                : undefined,
              contentInfo.youtubeVideoId ? `youtube: ${contentInfo.youtubeVideoId}` : undefined,
              `key: ${dfContentEntry.key}`,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0, alignItems: "center" }}>
          {/* Hidden below md, where the grid is one column whatever this says -
              the same reason the library's density toggle is desktop-only. */}
          {!belowMd && (
            <ToggleButtonGroup
              size="small"
              exclusive
              value={layout}
              onChange={(_, next) => next && applyLayout(next)}
            >
              <ToggleButton value="split" sx={{ paddingY: 0.25 }}>
                <Tooltip title="Side by side">
                  <VerticalSplitIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="stacked" sx={{ paddingY: 0.25 }}>
                <Tooltip title="Stacked">
                  <HorizontalSplitIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          )}
          {onClose && (
            <Tooltip title="Close">
              <IconButton aria-label="Close" onClick={onClose} size="small">
                <CloseIcon />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>

      {/*
        Split keeps the media and its prose permanently on the left, with
        everything you can act on beside it - which is what this layout was
        introduced for, since a long YouTube description used to push the
        actionable half off-screen.

        Stacked is one column, and there the media becomes a tab like
        anything else. That is the layout the tabs earn their place in: the
        actions are reachable from the top of the panel rather than below
        however long the description happens to be.
      */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: stacked ? "1fr" : "minmax(0, 1.15fr) minmax(0, 1fr)",
          },
          gap: 4,
          alignItems: stableHeightPx ? "stretch" : "start",
          flex: stableHeightPx ? "1 1 auto" : undefined,
          minHeight: 0,
        }}
      >
        {!stacked && (
          <Box
            sx={{
              minWidth: 0,
              minHeight: 0,
              overflowY: stableHeightPx ? "auto" : "visible",
              "::-webkit-scrollbar": { display: "none" },
            }}
          >
            {media}
          </Box>
        )}
        {panels}
      </Box>
    </ContentItemDetailContainer>
  );
};
