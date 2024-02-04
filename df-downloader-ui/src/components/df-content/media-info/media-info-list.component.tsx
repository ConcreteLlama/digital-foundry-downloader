import { useMediaQuery } from "@mui/material";
import { theme } from "../../../themes/theme";
import { DfContentInfo, MediaInfo } from "df-downloader-common";
import { MediaInfoAccordion } from "./media-info-accordion.component";
import { MediaInfoTable } from "./media-info-table.component";

export type MediaInfoListProps = {
  contentInfo: DfContentInfo;
  currentDownloadingType?: string;
  downloadedContentType?: string;
  mediaInfo: MediaInfo[];
};

export const MediaInfoList = (props: MediaInfoListProps) => {
  const useCondensed = useMediaQuery(theme.breakpoints.down("sm"));
  return useCondensed ? <MediaInfoAccordion {...props} /> : <MediaInfoTable {...props} />;
};
