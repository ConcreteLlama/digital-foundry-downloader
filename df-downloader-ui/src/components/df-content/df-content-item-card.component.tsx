import { useSelector } from "react-redux";
import { Box, Divider, Typography, Stack, CardActionArea, CardActions } from "@mui/material";
import { Image } from "mui-image";
import { HoverOverCard } from "../general/hover-card.component";
import { store } from "../../store/store";
import { setSelectedItem } from "../../store/df-content/df-content.action";
import { DfContentInfoUtils } from "df-downloader-common";
import { secondsToHHMMSS } from "df-downloader-common";
import { selectDfContentInfoItem } from "../../store/df-content/df-content.selector";
import { DfContentStatusSummary } from "./df-content-status-summary.component";

export type DfContentInfoItemCardProps = {
  dfContentName: string;
};

const thumbWidth = 450;

export const DfContentInfoItemCard = ({ dfContentName }: DfContentInfoItemCardProps) => {
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
      <CardActionArea onClick={() => store.dispatch(setSelectedItem(dfContentName))} sx={{ marginBottom: 0 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr 4fr 1fr",
            columnGap: 2,
          }}
        >
          <Box sx={{ marginY: 2 }}>
            <Image
              src={DfContentInfoUtils.getThumbnailUrl(contentInfo, thumbWidth)}
              width={thumbWidth}
              duration={500}
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
