import { Box, Stack, Typography } from "@mui/material";
import { DfContentInfoUtils, STARTED_FRACTION, secondsToHHMMSS } from "df-downloader-common";
import { useSelector } from "react-redux";
import { useDfContentEntry } from "../../../hooks/use-df-content-entry.ts";
import { selectContentBadges } from "../../../store/df-content/df-content.selector.ts";
import { monoFontFamily } from "../../../themes/build-theme.ts";
import { DfThumbnailImage } from "../../general/df-thumbnail-image.component.tsx";
import { contentRowStateSpecs, spineStyles } from "./content-row-state.ts";
import { StartDownloadingButton } from "../start-download-dialog.component.tsx";
import { RowBadges } from "./row-badges.component.tsx";
import { StateBlock } from "./state-block.component.tsx";
import { useContentRowStatus } from "./use-content-row-status.ts";

export type ContentGridCardProps = {
  dfContentName: string;
  onClick: () => void;
};

/**
 * The grid alternative to a row. Same state model, same non-colour channels -
 * the spine runs along the card's top edge instead of its left, and the
 * progress meter is still the card's own bottom edge.
 */
export const ContentGridCard = ({ dfContentName, onClick }: ContentGridCardProps) => {
  const entry = useDfContentEntry(dfContentName);
  const status = useContentRowStatus(entry);
  const badges = useSelector(selectContentBadges(dfContentName));
  if (!entry) {
    return null;
  }
  const { contentInfo } = entry;
  const spec = contentRowStateSpecs[status.state];
  const durationSeconds = DfContentInfoUtils.getDurationSeconds(contentInfo);
  const spine = spineStyles(spec);
  /*
    How far through, along the bottom of the thumbnail.

    Watched fills the bar rather than showing wherever you stopped: people
    routinely leave the last thirty seconds of credits, and a bar sitting at
    96% reads as unfinished business when it is not.
  */
  const watchProgress = badges?.watched ? 1 : badges?.watchedFraction ?? 0;

  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={contentInfo.title}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      sx={{
        position: "relative",
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" },
        display: "flex",
        flexDirection: "column",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        overflow: "hidden",
        cursor: "pointer",
        backgroundColor: "background.paper",
        "&:hover": { borderColor: "text.disabled" },
      }}
    >
      {/* Spine along the top edge - same patterns, rotated 90 degrees. */}
      <Box
        sx={{
          height: "2px",
          flexShrink: 0,
          ...spine,
          ...(spec.spine === "dashed" || spec.spine === "dotted"
            ? {
                backgroundImage: (spine.backgroundImage as string).replace("to bottom", "to right"),
              }
            : {}),
        }}
      />
      <Box sx={{ position: "relative" }}>
        <DfThumbnailImage contentInfo={contentInfo} width={320} displayWidth="100%" />
        {durationSeconds > 0 && (
          <Typography
            sx={{
              position: "absolute",
              right: 4,
              bottom: 4,
              paddingX: 0.5,
              borderRadius: 0.5,
              backgroundColor: "rgba(0, 0, 0, 0.72)",
              color: "#fff",
              fontFamily: monoFontFamily,
              fontSize: "0.625rem",
            }}
          >
            {secondsToHHMMSS(durationSeconds)}
          </Typography>
        )}
        {watchProgress > STARTED_FRACTION && (
          <Box
            sx={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "3px",
              backgroundColor: "rgba(0, 0, 0, 0.45)",
            }}
          >
            <Box
              sx={{
                width: `${watchProgress * 100}%`,
                height: "100%",
                backgroundColor: badges?.watched ? "success.main" : "primary.main",
              }}
            />
          </Box>
        )}
      </Box>
      <Stack sx={{ padding: 1, gap: 0.5, flex: "1 1 auto" }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: "0.8125rem",
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {contentInfo.title}
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.625rem", color: "text.secondary" }}>
            {contentInfo.publishedDate.toISOString().slice(0, 10)}
          </Typography>
          <RowBadges contentKey={contentInfo.key} />
        </Stack>
        <Box sx={{ marginTop: "auto" }} onClick={(event) => event.stopPropagation()}>
          {status.state === "available" ? (
            <StartDownloadingButton
              contentEntry={entry}
              trigger={
                <StateBlock spec={spec} detail={status.detail} extraCount={status.extraCount} align="start" compact />
              }
            />
          ) : (
            <StateBlock spec={spec} detail={status.detail} extraCount={status.extraCount} align="start" compact />
          )}
        </Box>
      </Stack>
      {typeof status.percent === "number" && (
        <Box
          sx={{
            position: "absolute",
            left: 0,
            bottom: 0,
            height: "2px",
            width: `${Math.min(Math.max(status.percent, 0), 100)}%`,
            backgroundColor: spec.colour,
            transition: "width 400ms linear",
          }}
        />
      )}
    </Box>
  );
};
