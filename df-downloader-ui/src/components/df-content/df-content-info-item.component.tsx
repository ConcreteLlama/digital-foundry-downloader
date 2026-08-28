import { Box, Stack, SxProps, Typography, useMediaQuery,
  useTheme } from "@mui/material";
import { DfContentEntry } from "df-downloader-common";
import { useSelector } from "react-redux";
import { useDfContentEntry } from "../../hooks/use-df-content-entry.ts";
import { selectActivePipelineIdsForContent, selectDetailsForPipelineIds } from "../../store/df-tasks/tasks.selector.ts";
import { DfThumbnailImage } from "../general/df-thumbnail-image.component.tsx";
import { EllipsisTooltipText } from "../general/ellipsis-tooltip-text.component.tsx";

export type DfContentInfoItemProps = {
  dfContentName: string;
  sx?: SxProps;
};

const thumbWidth = 450;

const desktopLayout: SxProps = {
  display: "grid",
  gridTemplateColumns: "1fr 4fr 1fr",
  columnGap: 2,
};
const mobileLayout: SxProps = {
  display: "flex",
  flexDirection: "column",
};

export const DfContentInfoItem = ({ dfContentName, sx }: DfContentInfoItemProps) => {
  const theme = useTheme();
  const useMobileLayout = useMediaQuery(theme.breakpoints.down("md"));
  const sxProps = sx || useMobileLayout ? mobileLayout : desktopLayout;

  const dfContentEntry = useDfContentEntry(dfContentName);
  if (!dfContentEntry) {
    //TODO: Make this more sensible
    return <Typography>ERROR</Typography>;
  }
  const { contentInfo } = dfContentEntry;
  return (
    <Box sx={sxProps}>
      <Box
        sx={{
          marginY: 0.5,
        }}
      >
        <DfThumbnailImage
          contentInfo={contentInfo}
          width={thumbWidth}
          duration={500}
          style={{ borderRadius: 2 }}
        />
      </Box>
      <Box sx={{ margin: 1, overflow: "hidden" }}>
        {/* Description is lazy-loaded from YouTube only when the detail
            dialog opens (see df-content-item-detail.component.tsx) - not
            available here on the card, and raw YouTube descriptions (links,
            timestamps, sponsor blurbs) are too dense for this compact a
            layout even when it has already been fetched for a previously-
            opened item. */}
        <Typography variant="h5">{dfContentEntry?.contentInfo.title}</Typography>
      </Box>
      <DfContentInfoRightPanel dfContentEntry={dfContentEntry} />
    </Box>
  );
};

type DfContentInfoRightPanelProps = {
  dfContentEntry: DfContentEntry;
};
const DfContentInfoRightPanel = ({ dfContentEntry }: DfContentInfoRightPanelProps) => {
  const pipelineIds = useSelector(selectActivePipelineIdsForContent(dfContentEntry.key));
  const pipelineDetails = useSelector(selectDetailsForPipelineIds(pipelineIds));

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        alignItems: "space-between",
      }}
    >
      <Stack
        sx={{
          margin: 1,
        }}
      >
        <Typography>{dfContentEntry.contentInfo.publishedDate.toDateString()}</Typography>
      </Stack>
      <Stack
        sx={{
          margin: 1,
        }}
      >
        {pipelineDetails.length > 0 && <Typography>Current tasks:</Typography>}
        {pipelineDetails.map((pipelineDetail) => (
          <EllipsisTooltipText text={`${pipelineDetail.type} (${pipelineDetail.mediaFormat})`} key={`tt-${pipelineDetail.id}`} />
        ))}
      </Stack>
    </Box>
  );
};
