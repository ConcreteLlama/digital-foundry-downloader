import { useMediaQuery,
  useTheme } from "@mui/material";
import { DfContentEntry } from "df-downloader-common";
import { DownloadedInfoTable } from "./downloaded-info-table.component";
import { DownloadedInfosAccordian } from "./downloaded-info-accordion.component.tsx";

export type DownloadedInfoListProps = {
  contentEntry: DfContentEntry;
};

export const DownloadedInfoList = (props: DownloadedInfoListProps) => {
  const theme = useTheme();
  const useCondensed = useMediaQuery(theme.breakpoints.down("sm"));
  return useCondensed ? <DownloadedInfosAccordian {...props} /> : <DownloadedInfoTable {...props} />;
};
