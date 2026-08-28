import { Box, Chip, Stack, SvgIconProps, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import { bytesToHumanReadable, DfContentInfoUtils, secondsToHHMMSS } from "df-downloader-common";
import { useDfContentEntry } from "../../../hooks/use-df-content-entry.ts";
import { monoFontFamily } from "../../../themes/build-theme.ts";
import { RowDensity } from "../../../themes/ui-preferences.ts";
import { DfThumbnailImage } from "../../general/df-thumbnail-image.component.tsx";
import { contentRowStateSpecs, spineStyles } from "./content-row-state.ts";
import { useContentRowStatus } from "./use-content-row-status.ts";

export type ContentRowProps = {
  dfContentName: string;
  density: RowDensity;
  onClick: () => void;
};

/**
 * Thumbnail width in CSS px per density, at each breakpoint.
 *
 * The thumbnail is what sets the row height (16:9 plus the row's padding), so
 * these are the density control in practice - 128px gives an ~88px row, 96px
 * an ~64px one. Mobile is 96px per the mobile render; the old layout requested
 * 450px and displayed it at 96, which is most of the reason phones were
 * pulling images five times larger than they drew.
 */
const THUMB_WIDTH = {
  comfortable: { desktop: 128, mobile: 96 },
  compact: { desktop: 96, mobile: 80 },
} as const;

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * One library row.
 *
 * The old card was a 1fr 4fr 1fr grid with a 450px thumbnail, which fitted
 * roughly three items on a 1440x900 screen for an archive of thousands. This
 * trades the picture down to a strip and puts the things you actually scan for
 * - state, date, format, size - on one tabular line.
 *
 * Progress is drawn as the row's own bottom edge rather than as a bar in the
 * flow, so a row that starts downloading doesn't change height and shove its
 * neighbours down the page.
 */
export const ContentRow = ({ dfContentName, density, onClick }: ContentRowProps) => {
  const theme = useTheme();
  const belowMd = useMediaQuery(theme.breakpoints.down("md"));
  const entry = useDfContentEntry(dfContentName);
  const status = useContentRowStatus(entry);

  if (!entry) {
    return null;
  }

  const { contentInfo } = entry;
  const spec = contentRowStateSpecs[status.state];
  const StateIcon = spec.icon;
  const thumbWidth = THUMB_WIDTH[density][belowMd ? "mobile" : "desktop"];

  const durationSeconds = DfContentInfoUtils.getDurationSeconds(contentInfo);
  const bestSize = entry.downloads[0]?.mediaInfo.size ?? contentInfo.mediaInfo.find((m) => m.size)?.size;
  const formats = new Set(contentInfo.mediaInfo.map((m) => m.formatString));

  // One tabular line, mono so the columns line up down the page even though
  // each row's values are different widths.
  const metaParts = [
    formatDate(contentInfo.publishedDate),
    entry.downloads.length > 0
      ? entry.downloads.length > 1
        ? `${entry.downloads.length} files`
        : entry.downloads[0].mediaInfo.formatString
      : `${formats.size} format${formats.size === 1 ? "" : "s"}`,
    bestSize ? bytesToHumanReadable(bestSize) : undefined,
  ].filter(Boolean) as string[];

  return (
    <Box
      onClick={onClick}
      sx={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: belowMd ? "2px auto 1fr" : "2px auto 1fr auto",
        columnGap: belowMd ? 1.5 : 2,
        alignItems: "center",
        paddingY: density === "compact" ? 0.5 : 1,
        paddingRight: 2,
        borderBottom: "1px solid",
        borderColor: "divider",
        cursor: "pointer",
        backgroundColor: "background.paper",
        transition: "background-color 120ms ease",
        "&:hover": { backgroundColor: "action.hover" },
      }}
    >
      {/* Status spine - 2px, and patterned as well as coloured. */}
      <Box sx={{ alignSelf: "stretch", width: "2px", ...spineStyles(spec) }} />

      <Box sx={{ position: "relative", paddingLeft: belowMd ? 1 : 1.5 }}>
        <DfThumbnailImage contentInfo={contentInfo} width={thumbWidth} />
        {durationSeconds > 0 && (
          <Typography
            sx={{
              position: "absolute",
              right: 3,
              bottom: 3,
              paddingX: 0.5,
              borderRadius: 0.5,
              backgroundColor: "rgba(0, 0, 0, 0.72)",
              color: "#fff",
              fontFamily: monoFontFamily,
              fontSize: "0.625rem",
              lineHeight: 1.5,
            }}
          >
            {secondsToHHMMSS(durationSeconds)}
          </Typography>
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: density === "compact" ? "0.8125rem" : "0.875rem",
            lineHeight: 1.35,
            display: "-webkit-box",
            WebkitLineClamp: density === "compact" ? 1 : 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {contentInfo.title}
        </Typography>
        <Typography
          sx={{
            fontFamily: monoFontFamily,
            fontSize: "0.6875rem",
            color: "text.secondary",
            marginTop: 0.25,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {metaParts.join("  /  ")}
        </Typography>
        {density !== "compact" && contentInfo.tags && contentInfo.tags.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ marginTop: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
            {contentInfo.tags.slice(0, belowMd ? 2 : 4).map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: "0.625rem", fontWeight: 400, color: "text.disabled" }}
              />
            ))}
          </Stack>
        )}
        {belowMd && <StateBlock spec={spec} StateIcon={StateIcon} status={status} compact />}
      </Box>

      {!belowMd && (
        <Box sx={{ textAlign: "right", minWidth: 132 }}>
          <StateBlock spec={spec} StateIcon={StateIcon} status={status} />
        </Box>
      )}

      {/*
        The row's own bottom edge doubles as the progress meter, so a live row
        occupies exactly the same space as an idle one.
      */}
      {typeof status.percent === "number" && (
        <Box
          sx={{
            position: "absolute",
            left: 0,
            bottom: -1,
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

type StateBlockProps = {
  spec: (typeof contentRowStateSpecs)[keyof typeof contentRowStateSpecs];
  StateIcon: React.FC<SvgIconProps>;
  status: ReturnType<typeof useContentRowStatus>;
  compact?: boolean;
};

const StateBlock = ({ spec, StateIcon, status, compact }: StateBlockProps) => (
  <Stack
    direction="row"
    spacing={0.75}
    sx={{
      alignItems: "center",
      justifyContent: compact ? "flex-start" : "flex-end",
      marginTop: compact ? 0.5 : 0,
    }}
  >
    {/* Dot: filled or hollow, a second channel independent of hue. */}
    <Box
      sx={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        flexShrink: 0,
        backgroundColor: spec.dot === "filled" ? spec.colour : "transparent",
        border: spec.dot === "hollow" ? "1.5px solid" : "none",
        borderColor: spec.colour,
        color: spec.colour,
      }}
    />
    <StateIcon sx={{ fontSize: 14, color: spec.colour }} />
    <Tooltip title={status.detail ?? ""} disableHoverListener={!status.detail}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: spec.colour, lineHeight: 1.3 }}>
          {spec.label}
        </Typography>
        {status.detail && (
          <Typography
            sx={{
              fontFamily: monoFontFamily,
              fontSize: "0.625rem",
              color: "text.disabled",
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: compact ? 220 : 132,
            }}
          >
            {status.detail}
          </Typography>
        )}
      </Box>
    </Tooltip>
  </Stack>
);
