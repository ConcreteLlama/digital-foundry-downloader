import { Box, Tooltip, Typography } from "@mui/material";
import { DfContentSubtitleInfo } from "df-downloader-common/models/df-content-download-info";

import SubtitlesIcon from "@mui/icons-material/Subtitles";
import { selectSubtitlesIcon } from "../../../icons/utils.ts";

type SubtitlesInfoProps = {
  subtitles: DfContentSubtitleInfo[];
};

export const SubtitlesInfo = ({ subtitles }: SubtitlesInfoProps) => {
  if (!subtitles.length) {
    return <Typography>None</Typography>;
  }
  const subtitleLanguage = subtitles.map((subtitle) => subtitle.language).join(", ");
  const subtitleInfo = subtitles[0];
  const SubtitleServiceIcon = subtitles.length > 1 ? SubtitlesIcon : selectSubtitlesIcon(subtitleInfo.service);
  const tooltipText = subtitles.map((subtitle) => subtitle.service).join(", ");
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        gap: "0.5rem",
      }}
    >
      <Tooltip title={tooltipText}>
        <Box>{<SubtitleServiceIcon />}</Box>
      </Tooltip>
      <Typography>{subtitleLanguage}</Typography>
    </Box>
  );
};
