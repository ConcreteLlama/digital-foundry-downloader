import { List, ListItem, Stack } from "@mui/material";
import { useSelector } from "react-redux";
import { selectDownloadQueue } from "../../store/download-queue/download-queue.selector";
import { DownloadQueueItem } from "./download-queue-item.component";

//TODO: All items should be screen width (would a table be better? ultimately want to make this draggable so probably not)
export const DownloadQueue = () => {
  const downloadQueue = useSelector(selectDownloadQueue);
  return (
    <Stack sx={{ margin: 2, justifyItems: "center", marginTop: 1 }}>
      <List sx={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {downloadQueue.map((queueItem) => (
          <ListItem key={`df-download-list-item-${queueItem.name}`} sx={{ display: "flex", justifyContent: "center" }}>
            <DownloadQueueItem queueItem={queueItem} key={`download-queue-item=${queueItem.name}`} />
          </ListItem>
        ))}
      </List>
    </Stack>
  );
};
