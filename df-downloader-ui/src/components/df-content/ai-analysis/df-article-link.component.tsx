import ArticleIcon from "@mui/icons-material/Article";
import {
  Button,
  CircularProgress,
  Link,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import {
  DfArticleLookupResponse,
  fetchDfArticle,
} from "../../../api/ai-analysis.ts";

/**
 * Shows Digital Foundry's written companion article for a video, if one is
 * known, and offers to look for it if not.
 *
 * Deliberately does not search on mount. Reading a content panel should not
 * generate traffic against digitalfoundry.net - open twenty items while
 * browsing and an auto-search would be twenty lookups against a site whose
 * robots.txt asks for a five-second crawl delay. So a panel open shows only
 * what is already stored, and searching is an explicit act.
 *
 * The wording of the empty state matters and is not incidental: a video can
 * exist well before its article, or never get one, so "none found yet" is
 * the honest phrasing rather than "no article exists". Looking again later
 * is a normal thing to do, not a retry after a failure.
 *
 * Related articles are shown separately and more quietly than the
 * companion piece, because they are a weaker claim. The companion piece is
 * a page written about this video; a related one is a round-up that
 * happens to embed it among several. Presenting them alike would imply the
 * round-up is about this video, which is the same false positive the
 * matching itself is careful to avoid.
 */
export const DfArticleLink = ({
  contentKey,
  onHasContent,
}: {
  contentKey: string;
  /** Reports whether anything was found, so a tab can indicate it. */
  onHasContent?: (hasContent: boolean) => void;
}) => {
  const [state, setState] = useState<DfArticleLookupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setState(await fetchDfArticle(contentKey));
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [contentKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onHasContent?.(Boolean(state?.article) || Boolean(state?.relatedArticles?.length));
  }, [state, onHasContent]);

  const search = async () => {
    setSearching(true);
    try {
      setState(await fetchDfArticle(contentKey, { search: true }));
    } catch {
      // Leave the previous state in place - a failed search has not
      // changed what we know, and blanking the panel would suggest it had.
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return <CircularProgress size={14} />;
  }

  const related = state?.relatedArticles ?? [];
  const alsoIn = related.length > 0 && (
    <Stack spacing={0.25} sx={{ pl: 3.5 }}>
      <Typography variant="caption" sx={{ color: "text.disabled" }}>
        Also appears in
      </Typography>
      {related.map((article) => (
        <Link
          key={article.url}
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          variant="caption"
          sx={{ color: "text.secondary" }}
        >
          {article.title}
        </Link>
      ))}
    </Stack>
  );

  if (state?.article) {
    return (
      <Stack spacing={0.5}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <ArticleIcon fontSize="small" sx={{ color: "text.disabled" }} />
          <Link
            href={state.article.url}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            variant="body2"
          >
            {state.article.title}
          </Link>
          {state.article.author && (
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              by {state.article.author}
            </Typography>
          )}
        </Stack>
        {alsoIn}
      </Stack>
    );
  }

  return (
    <Stack spacing={0.5}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
      >
        <Typography variant="body2" sx={{ color: "text.disabled" }}>
          {state?.lastAttemptedAt
            ? "No matching article found yet"
            : "Not checked yet"}
        </Typography>
        <Tooltip
          title={
            state?.lastAttemptedAt
              ? `Last checked ${new Date(state.lastAttemptedAt).toLocaleString()}. Digital Foundry often publish their written piece after the video, so it is worth looking again later.`
              : "Searches Digital Foundry for the written article that accompanies this video."
          }
        >
          <span>
            <Button size="small" disabled={searching} onClick={search}>
              {searching
                ? "Looking…"
                : state?.lastAttemptedAt
                  ? "Look again"
                  : "Find article"}
            </Button>
          </span>
        </Tooltip>
        {searching && <CircularProgress size={14} />}
      </Stack>
      {alsoIn}
    </Stack>
  );
};
