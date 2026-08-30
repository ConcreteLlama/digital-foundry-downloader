import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControlLabel,
  Link,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { DfArticleListingItem } from "df-downloader-common";
import { useEffect, useMemo, useState } from "react";
import { fetchDfArticles } from "../../api/df-articles.ts";
import { DfContentInfoItemDetail } from "../df-content/df-content-item-detail/df-content-item-detail.component.tsx";
import { MiddleModal } from "../general/middle-modal.component.tsx";
import { conciseFormatDate } from "../../utils/date.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";

/**
 * Digital Foundry's written articles, and the videos they go with.
 *
 * Everything here comes from the metadata cache the article matcher already
 * keeps, so opening this page fetches nothing from Digital Foundry.
 *
 * That also bounds what it can show, and the page says so rather than
 * implying otherwise: this is what the app has encountered - the pieces the
 * periodic scan has read, plus every candidate weighed while searching for a
 * companion article - not the full archive. An article with no linked video
 * is an ordinary entry rather than a failure, since plenty are about things
 * this library has never seen.
 */
const ArticleRow = ({
  article,
  onOpenContent,
}: {
  article: DfArticleListingItem;
  onOpenContent: (contentKey: string) => void;
}) => (
  <Box sx={{ paddingY: 1.25, borderBottom: 1, borderColor: "divider" }}>
    <Link
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      variant="body2"
      sx={{ lineHeight: 1.35, fontWeight: 500 }}
    >
      {article.title}
      <OpenInNewIcon sx={{ fontSize: "0.85rem", marginLeft: 0.5, verticalAlign: "-0.1em" }} />
    </Link>
    <Typography variant="caption" sx={{ color: "text.disabled", display: "block", marginTop: 0.25 }}>
      {[article.author, article.lastmod ? conciseFormatDate(article.lastmod) : undefined].filter(Boolean).join(" · ")}
    </Typography>
    {article.linkedVideos.length > 0 ? (
      <Stack direction="row" spacing={0.5} sx={{ marginTop: 0.75, flexWrap: "wrap" }} useFlexGap>
        {article.linkedVideos.map((video) => (
          <Chip
            key={video.contentKey}
            size="small"
            variant="outlined"
            label={video.title}
            onClick={() => onOpenContent(video.contentKey)}
            sx={{
              maxWidth: "100%",
              height: "auto",
              paddingY: 0.25,
              "& .MuiChip-label": { whiteSpace: "normal", fontSize: "0.72rem", lineHeight: 1.3 },
              ...(video.downloaded ? { borderColor: "success.main", color: "success.main" } : {}),
            }}
          />
        ))}
      </Stack>
    ) : (
      <Typography
        variant="caption"
        sx={{ color: "text.disabled", fontFamily: monoFontFamily, display: "block", marginTop: 0.5 }}
      >
        {article.videoIds.length
          ? `embeds ${article.videoIds.length} video${article.videoIds.length === 1 ? "" : "s"}, none in your library`
          : "no embedded video"}
      </Typography>
    )}
  </Box>
);

export const ArticlesPage = () => {
  const [articles, setArticles] = useState<DfArticleListingItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyLinked, setOnlyLinked] = useState(false);
  const [contentKey, setContentKey] = useState<string | null>(null);

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

  if (loading) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", padding: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="body2" sx={{ color: "text.disabled" }}>
          Reading the article list...
        </Typography>
      </Stack>
    );
  }

  if (failed) {
    return <Alert severity="error">Could not read the article list.</Alert>;
  }

  const linkedCount = (articles ?? []).filter((article) => article.linkedVideos.length > 0).length;

  return (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      {!articles?.length ? (
        <Alert severity="info">
          No articles known yet. They are recorded as Digital Foundry publish them, and as the app looks for the written
          companion to a video, so this fills in over time rather than all at once.
        </Alert>
      ) : (
        <>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }} useFlexGap>
            <TextField
              size="small"
              label="Filter"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{ maxWidth: 280, flex: "1 1 180px" }}
            />
            <FormControlLabel
              control={
                <Switch size="small" checked={onlyLinked} onChange={(event) => setOnlyLinked(event.target.checked)} />
              }
              label="With linked videos only"
              sx={{ marginLeft: 0, "& .MuiFormControlLabel-label": { fontSize: "0.8125rem" } }}
            />
          </Stack>

          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            {articles.length.toLocaleString()} articles known, {linkedCount.toLocaleString()} with a video in your
            library
            {filtered.length !== articles.length && ` · ${filtered.length.toLocaleString()} match the filter`}
          </Typography>

          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            These are the articles this app has come across rather than everything Digital Foundry have published: the
            pieces it read while checking for new ones, plus any it weighed up while looking for a video's companion
            article.
          </Typography>

          <Box>
            {filtered.map((article) => (
              <ArticleRow key={article.url} article={article} onOpenContent={setContentKey} />
            ))}
          </Box>
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
