import { Stack, Typography } from "@mui/material";
import { HoverOverCard } from "../general/hover-card.component";
import { QueuedContent } from "df-downloader-common";
import { QueuedContentDetail } from "../df-content/queued-content-info.component";

export type DownloadQueueItemProps = {
  queueItem: QueuedContent;
};

export const DownloadQueueItem = (props: DownloadQueueItemProps) => {
  const { queueItem } = props;
  return (
    <HoverOverCard>
      <Stack sx={{ margin: 2 }}>
        <Typography>{queueItem.dfContent?.title}</Typography>
        <QueuedContentDetail queuedContent={queueItem} />
      </Stack>
    </HoverOverCard>
  );
};
