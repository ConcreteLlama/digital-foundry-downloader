import { Box, CardActionArea, CardActions, Divider, Stack, SxProps, Typography, useMediaQuery } from "@mui/material";
import { DfContentInfoUtils, secondsToHHMMSS } from "df-downloader-common";
import { Image } from "mui-image";
import { useSelector } from "react-redux";
import { selectDfContentInfoItem } from "../../store/df-content/df-content.selector";
import { theme } from "../../themes/theme";
import { HoverOverCard } from "../general/hover-card.component";
import { DfContentStatusSummary } from "./df-content-status-summary.component";

export type DfContentInfoItemCardProps = {
  dfContentName: string;
  onClick: () => void;
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

export const DfContentInfoItemCard = ({ dfContentName, onClick }: DfContentInfoItemCardProps) => {
  const useMobileLayout = useMediaQuery(theme.breakpoints.down("md"));

  const dfContentEntry = useSelector(selectDfContentInfoItem(dfContentName));
  if (!dfContentEntry) {
    //TODO: Make this more sensible
    return <Typography>ERROR</Typography>;
  }
  const { contentInfo } = dfContentEntry;
  //      onClick={() => store.dispatch(setSelectedItem(dfContentName))}

  return (
    <HoverOverCard
      sx={{
        borderBottom: "1px solid",
        borderColor: "secondary.main",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-around",
      }}
    >
      <CardActionArea onClick={onClick} sx={{ marginBottom: 0 }}>
        <Box sx={useMobileLayout ? mobileLayout : desktopLayout}>
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
          <Stack sx={{ margin: 1 }}>
            <Typography>{dfContentEntry.contentInfo.publishedDate.toDateString()}</Typography>
            <Typography>
              {secondsToHHMMSS(DfContentInfoUtils.getDurationSeconds(dfContentEntry.contentInfo))}
            </Typography>
          </Stack>
        </Box>
      </CardActionArea>
      <Divider sx={{ width: "90%" }} />
      <CardActions>
        <DfContentStatusSummary content={dfContentEntry} />
      </CardActions>
    </HoverOverCard>
  );
};
