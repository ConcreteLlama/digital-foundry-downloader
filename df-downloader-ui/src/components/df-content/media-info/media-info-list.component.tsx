import { useMediaQuery,
  useTheme } from "@mui/material";
import { DfContentEntry } from "df-downloader-common";
import { MediaInfoAccordion } from "./media-info-accordion.component";
import { MediaInfoTable } from "./media-info-table.component";

export type MediaInfoListProps = {
  contentEntry: DfContentEntry;
};

export const MediaInfoList = (props: MediaInfoListProps) => {
  const theme = useTheme();
  const useCondensed = useMediaQuery(theme.breakpoints.down("sm"));
  return useCondensed ? <MediaInfoAccordion {...props} /> : <MediaInfoTable {...props} />;
};
