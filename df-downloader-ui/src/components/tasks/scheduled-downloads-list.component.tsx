import { Box, Divider, Typography } from "@mui/material";
import { secondsToHHMMSS } from "df-downloader-common";
import { useSelector } from "react-redux";
import { selectScheduledDownloads } from "../../store/df-tasks/tasks.selector.ts";

export const ScheduledDownloadsList = () => {
  const scheduledDownloads = useSelector(selectScheduledDownloads);
  if (scheduledDownloads.length === 0) {
    return null;
  }
  return (
    <Box>
      <Divider>Scheduled Auto-Downloads</Divider>
      {scheduledDownloads.map((scheduled) => (
        <ScheduledDownloadRow key={scheduled.contentKey} scheduledFor={scheduled.scheduledFor} title={scheduled.title} />
      ))}
    </Box>
  );
};

type ScheduledDownloadRowProps = {
  title: string;
  scheduledFor: Date;
};
const ScheduledDownloadRow = ({ title, scheduledFor }: ScheduledDownloadRowProps) => {
  const remainingSeconds = Math.max(0, Math.round((new Date(scheduledFor).getTime() - Date.now()) / 1000));
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingY: "4px" }}>
      <Typography noWrap sx={{ flex: 1, marginRight: "1rem" }}>
        {title}
      </Typography>
      <Typography color="gray">Downloading in {secondsToHHMMSS(remainingSeconds)}</Typography>
    </Box>
  );
};
