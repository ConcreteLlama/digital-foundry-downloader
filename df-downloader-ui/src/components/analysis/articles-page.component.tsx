import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  FormControlLabel,
  Link,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DfArticleLinkedVideo, DfArticleListingItem, DfContentInfoUtils } from "df-downloader-common";
import { useEffect, useMemo, useState } from "react";
import { fetchDfArticles } from "../../api/df-articles.ts";
import { DfContentInfoItemDetail } from "../df-content/df-content-item-detail/df-content-item-detail.component.tsx";
import { MiddleModal } from "../general/middle-modal.component.tsx";
import { NumericPagination } from "../general/numeric-pagination.component.tsx";
import { Thumb } from "../general/thumb.component.tsx";
import { conciseFormatDate } from "../../utils/date.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";

/**
 * Digital Foundry's written articles, and the videos they go with.
 *
 * Everything here comes from what was already stored while matching articles
 * to videos, so opening this page fetches nothing from Digital Foundry.
 *
 * That also bounds what it can show, and the page says so rather than
 * implying otherwise: this is what the app has encountered, not the full
 * archive. An article with no linked video is an ordinary entry, since
 * plenty are about things this library has never seen.
 *
 * Laid out as cards carrying the video's own thumbnail rather than as a list
 * of links, because the question being asked of this page is almost always
 * "which video is this about" - and in an app where everything else is
 * identified by its thumbnail, a wall of blue text answers that slowly.
 */

/** Displayed at 72px; asked for at 2x so it stays sharp on a good screen. */
const THUMB_DISPLAY_WIDTH = 72;

/** Matches the content list, which is the other long list in the app. */
const PAGE_SIZE = 25;

const LinkedVideoRow = ({
  video,
  onOpenContent,
}: {
  video: DfArticleLinkedVideo;
  onOpenContent: (contentKey: string) => void;
}) => (
  <Stack
    direction="row"
    spacing={1.25}
    role="button"
    tabIndex={0}
    onClick={() => onOpenContent(video.contentKey)}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpenContent(video.contentKey);
      }
    }}
    sx={{
      alignItems: "center",
      padding: 0.75,
      borderRadius: 1,
      cursor: "pointer",
      transition: "background-color 120ms",
      "&:hover": { backgroundColor: "action.hover" },
      "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
    }}
  >
    <Box
      sx={{
        width: THUMB_DISPLAY_WIDTH,
        flexShrink: 0,
        borderRadius: 0.75,
        overflow: "hidden",
        lineHeight: 0,
        backgroundColor: "common.black",
      }}
    >
      <Thumb
        src={
          video.thumbnailUrl
            ? DfContentInfoUtils.thumbnailUrlToSize(video.thumbnailUrl, THUMB_DISPLAY_WIDTH * 2)
            : video.youtubeVideoId
              ? DfContentInfoUtils.getYoutubeThumbnailUrl(video.youtubeVideoId, "mqdefault")
              : ""
        }
        alt={video.title}
        width="100%"
      />
    </Box>
    <Typography sx={{ minWidth: 0, fontSize: "0.8125rem", lineHeight: 1.35, flex: "1 1 auto" }}>
      {video.title}
    </Typography>
    {video.downloaded && (
      <Tooltip title="Downloaded">
        <CheckCircleIcon sx={{ fontSize: "1rem", color: "success.main", flexShrink: 0 }} />
      </Tooltip>
    )}
  </Stack>
);

const ArticleCard = ({
  article,
  onOpenContent,
}: {
  article: DfArticleListingItem;
  onOpenContent: (contentKey: string) => void;
}) => {
  const meta = [article.author, article.lastmod ? conciseFormatDate(article.lastmod) : undefined].filter(Boolean);
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        padding: 1.5,
        backgroundColor: "background.paper",
        transition: "border-color 140ms",
        "&:hover": { borderColor: "primary.main" },
      }}
    >
      <Link
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        underline="hover"
        sx={{
          display: "inline-block",
          fontSize: "1.0625rem",
          fontWeight: 600,
          lineHeight: 1.3,
          color: "text.primary",
          "&:hover": { color: "primary.main" },
        }}
      >
        {article.title}
        <OpenInNewIcon sx={{ fontSize: "0.8rem", marginLeft: 0.75, verticalAlign: "-0.05em", opacity: 0.6 }} />
      </Link>

      {meta.length > 0 && (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            marginTop: 0.5,
            color: "text.disabled",
            fontFamily: monoFontFamily,
            fontSize: "0.6875rem",
          }}
        >
          {meta.join("  ·  ")}
        </Typography>
      )}

      {article.linkedVideos.length > 0 ? (
        <Stack sx={{ marginTop: 1.25 }}>
          {/* Labelled and set below a rule, so the article reads as the
              subject of the row and the videos as what it covers - without
              the label they competed, the thumbnail winning. */}
          <Divider sx={{ marginBottom: 0.75 }} />
          <Typography
            variant="overline"
            sx={{ color: "text.disabled", fontSize: "0.625rem", lineHeight: 1.6, marginBottom: 0.25 }}
          >
            {article.linkedVideos.length === 1 ? "Covers" : `Covers ${article.linkedVideos.length} videos`}
          </Typography>
          {article.linkedVideos.map((video) => (
            <LinkedVideoRow key={video.contentKey} video={video} onOpenContent={onOpenContent} />
          ))}
        </Stack>
      ) : (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            marginTop: 1,
            color: "text.disabled",
            fontFamily: monoFontFamily,
            fontSize: "0.6875rem",
          }}
        >
          {article.videoIds.length
            ? `embeds ${article.videoIds.length} video${article.videoIds.length === 1 ? "" : "s"}, none in your library`
            : "no embedded video"}
        </Typography>
      )}
    </Box>
  );
};

export const ArticlesPage = () => {
  const [articles, setArticles] = useState<DfArticleListingItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyLinked, setOnlyLinked] = useState(false);
  const [contentKey, setContentKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetchDfArticles()
      .then((result) => !cancelled && setArticles(result.articles))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!articles) {
      return [];
    }
    const needle = search.trim().toLowerCase();
    let list = articles;
    if (needle) {
      list = list.filter(
        (article) =>
          article.title.toLowerCase().includes(needle) ||
          article.linkedVideos.some((video) => video.title.toLowerCase().includes(needle))
      );
    }
    if (onlyLinked) {
      list = list.filter((article) => article.linkedVideos.length > 0);
    }
    return list;
  }, [articles, search, onlyLinked]);

  // Back to the first page whenever the list underneath changes, or a filter
  // that narrows it would leave you stranded past the end.
  useEffect(() => {
    setPage(1);
  }, [search, onlyLinked]);

  const numPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, numPages);
  const visible = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  if (loading) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", padding: { xs: 1.5, md: 2 } }}>
        <CircularProgress size={18} />
        <Typography variant="body2" sx={{ color: "text.disabled" }}>
          Reading the article list...
        </Typography>
      </Stack>
    );
  }

  if (failed) {
    return (
      <Box sx={{ padding: { xs: 1.5, md: 2 } }}>
        <Alert severity="error">Could not read the article list.</Alert>
      </Box>
    );
  }

  const linkedCount = (articles ?? []).filter((article) => article.linkedVideos.length > 0).length;

  return (
    /*
      Its own gutters, because this is a top-level route rather than a page
      inside a section - the section wrapper is what pads those, and without
      it the content sat flush against the edge of the screen.
    */
    <Stack spacing={2} sx={{ minWidth: 0, padding: { xs: 1.5, md: 2 } }}>
      {!articles?.length ? (
        <Alert severity="info">
          No articles known yet. They are recorded as Digital Foundry publish them, and as the app looks for the written
          companion to a video, so this fills in over time rather than all at once.
        </Alert>
      ) : (
        <>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
            useFlexGap
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: "1.375rem", fontWeight: 600, lineHeight: 1.2 }}>
                {articles.length.toLocaleString()}
                <Typography component="span" sx={{ fontSize: "0.875rem", fontWeight: 400, color: "text.secondary" }}>
                  {articles.length === 1 ? " article" : " articles"}
                </Typography>
              </Typography>
              <Typography variant="caption" sx={{ color: "text.disabled" }}>
                {linkedCount.toLocaleString()} with a video in your library
                {filtered.length !== articles.length && ` · showing ${filtered.length.toLocaleString()}`}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }} useFlexGap>
              <TextField
                size="small"
                label="Filter"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                sx={{ maxWidth: 260, flex: "1 1 160px" }}
              />
              <FormControlLabel
                control={
                  <Switch size="small" checked={onlyLinked} onChange={(event) => setOnlyLinked(event.target.checked)} />
                }
                label="Linked only"
                sx={{ marginLeft: 0, "& .MuiFormControlLabel-label": { fontSize: "0.8125rem" } }}
              />
            </Stack>
          </Stack>

          <Typography variant="caption" sx={{ color: "text.disabled", maxWidth: "72ch" }}>
            What this app has come across rather than everything Digital Foundry have published: the pieces it read
            while checking for new ones, plus any weighed up while looking for a video's companion article.
          </Typography>

          <Stack spacing={1}>
            {visible.map((article) => (
              <ArticleCard key={article.url} article={article} onOpenContent={setContentKey} />
            ))}
          </Stack>

          {numPages > 1 && (
            <Box sx={{ display: "flex", justifyContent: "center", paddingTop: 0.5 }}>
              <NumericPagination currentPage={currentPage} numPages={numPages} onUpdatePage={setPage} />
            </Box>
          )}
        </>
      )}

      <MiddleModal
        open={Boolean(contentKey)}
        onClose={() => setContentKey(null)}
        id="articles-content-modal"
        hideCloseButton
      >
        <Box>
          <DfContentInfoItemDetail dfContentName={contentKey || ""} onClose={() => setContentKey(null)} />
        </Box>
      </MiddleModal>
    </Stack>
  );
};
