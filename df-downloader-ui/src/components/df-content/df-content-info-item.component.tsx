import { Box, Divider, Stack, SxProps, Typography, useMediaQuery } from "@mui/material";
import { DfContentEntry, DfContentInfoUtils, secondsToHHMMSS } from "df-downloader-common";
import { Image } from "mui-image";
import { useSelector } from "react-redux";
import { useDfContentEntry } from "../../hooks/use-df-content-entry.ts";
import { selectActivePipelineIdsForContent, selectDetailsForPipelineIds } from "../../store/df-tasks/tasks.selector.ts";
import { theme } from "../../themes/theme";
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
        <Image
          src={DfContentInfoUtils.getThumbnailUrl(contentInfo, thumbWidth)}
          duration={500}
          style={{ borderRadius: 2 }}
        ></Image>
      </Box>
      <Box sx={{ margin: 1, overflow: "hidden" }}>
        <Typography variant="h5">{dfContentEntry?.contentInfo.title}</Typography>
        <Divider />
        <Typography sx={{ marginTop: 2 }}>{dfContentEntry.contentInfo.description}</Typography>
      </Box>
      <DfContentInfoRightPanel dfContentEntry={dfContentEntry} />
    </Box>
  );
};

type DfContentInfoRightPanelProps = {
  dfContentEntry: DfContentEntry;
};
const DfContentInfoRightPanel = ({ dfContentEntry }: DfContentInfoRightPanelProps) => {
  const pipelineIds = useSelector(selectActivePipelineIdsForContent(dfContentEntry.contentInfo.name));
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
        <Typography>{secondsToHHMMSS(DfContentInfoUtils.getDurationSeconds(dfContentEntry.contentInfo))}</Typography>
      </Stack>
      <Stack
        sx={{
          margin: 1,
        }}
      >
        {pipelineDetails.length > 0 && <Typography>Current tasks:</Typography>}
        {pipelineDetails.map((pipelineDetail) => (
          <EllipsisTooltipText text={`${pipelineDetail.type} (${pipelineDetail.mediaType})`} />
        ))}
      </Stack>
    </Box>
  );
};
