import { useMediaQuery } from "@mui/material";
import { theme } from "../../../themes/theme";
import { DfContentEntry } from "df-downloader-common";
import { DownloadedInfoTable } from "./downloaded-info-table.component";
import { DownloadedInfosAccordian } from "./downloaded-info-accordion.component.tsx";

export type DownloadedInfoListProps = {
  contentEntry: DfContentEntry;
};

export const DownloadedInfoList = (props: DownloadedInfoListProps) => {
  const useCondensed = useMediaQuery(theme.breakpoints.down("sm"));
  return useCondensed ? <DownloadedInfosAccordian {...props} /> : <DownloadedInfoTable {...props} />;
};
