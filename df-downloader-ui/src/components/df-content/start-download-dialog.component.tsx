import DownloadIcon from "@mui/icons-material/Download";
import DownloadedIcon from "@mui/icons-material/DownloadDone";
import DownloadingIcon from "@mui/icons-material/Downloading";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { DfContentAvailability, DfContentEntry, DfContentEntryUtils, DfContentInfo, getBestMediaInfoMatch } from "df-downloader-common";
import { Fragment, useState } from "react";
import { useSelector } from "react-redux";
import { startDownload } from "../../store/df-tasks/tasks.action";
import { selectActivePipelineIdsForMediaFormat } from "../../store/df-tasks/tasks.selector.ts";
import { store } from "../../store/store";
import { selectConfigSectionField } from "../../store/config/config.selector.ts";

export type StartDownloadDialogProps = {
  contentInfo: DfContentInfo;
  mediaFormat?: string;
  open: boolean;
  onClose: () => void;
};

export const StartDownloadDialog = ({ contentInfo, mediaFormat, open, onClose }: StartDownloadDialogProps) => {
  const dialogContentName = mediaFormat ? `${contentInfo.title} (${mediaFormat})` : contentInfo.title;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Start Download</DialogTitle>
      <DialogContent>
        <DialogContentText>{`Are you sure you want to start downloading ${dialogContentName}?`}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => {
            store.dispatch(
              startDownload.start({
                key: contentInfo.key,
                mediaFormat,
              })
            );
            onClose();
          }}
        >
          Start
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export type StartDownloadButtonProps = {
  contentEntry: DfContentEntry;
  mediaFormat?: string;
  label?: string;
  disabled?: boolean;
  /**
   * Render this as the control instead of the built-in label/icon, keeping the
   * availability rules, tooltip and confirm dialog. The library row uses it so
   * its state block stays the state block and simply becomes clickable.
   */
  trigger?: React.ReactNode;
};

export const StartDownloadingButton = ({ contentEntry, mediaFormat, label, disabled, trigger }: StartDownloadButtonProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const activePipeline = useSelector(selectActivePipelineIdsForMediaFormat(contentEntry.key, mediaFormat || ""));
  const downloadContentInfo = DfContentEntryUtils.getDownloadForFormat(contentEntry, mediaFormat || "");
  const mediaFormats = useSelector(selectConfigSectionField("mediaFormats", "priorities"));
  const availability = contentEntry.statusInfo.availability;
  const mediaMatchesAvailable = getBestMediaInfoMatch(mediaFormats || [], contentEntry.contentInfo.mediaInfo, {
    mustMatch: true,
  });

  let VariantIcon = DownloadIcon;
  let tooltip = "Start Download";
  let buttonDisabled = disabled || false;
  let buttonText = "Available";
  if (activePipeline.length > 0) {
    VariantIcon = DownloadingIcon;
    tooltip = "Tasks currently active, cannot download content.";
    buttonDisabled = true;
  } else if (availability === DfContentAvailability.PAYWALLED) {
    VariantIcon = DownloadIcon;
    tooltip = "Content is paywalled and cannot be downloaded.";
    buttonDisabled = true;
  } else if (availability === DfContentAvailability.UNKNOWN) {
    VariantIcon = DownloadIcon;
    tooltip = "Content has unknown availibility and cannot be downloaded.";
    buttonDisabled = true;
  } else if (contentEntry.contentInfo.legacy) {
    // Legacy entries carry unconfirmed data from before the site relaunch -
    // their download link may point at the old, now-dead CDN. Blocks any new
    // download attempt (including re-downloading a format already on disk -
    // that would hit the same possibly-dead link), but never touches an
    // existing download record, which stays visible as history regardless.
    // The service enforces this too (df-content-manager.ts's downloadContent) -
    // this is just the UI-side reflection of the same rule.
    VariantIcon = DownloadIcon;
    tooltip = "This entry's data hasn't been confirmed against the current Digital Foundry site yet, so its download link may no longer work. Try \"Refresh Metadata\" to relocate it.";
    buttonDisabled = true;
    buttonText = "Not Yet Confirmed";
  } else if (downloadContentInfo) {
    VariantIcon = DownloadedIcon;
    tooltip = "Download again";
    buttonDisabled = false;
  } else if (!mediaFormat && !mediaMatchesAvailable) {
    VariantIcon = DownloadIcon;
    tooltip = "No downloads are available in the desired media format(s); open content to see available formats or change your Media Formats settings.";
    buttonDisabled = true;
    buttonText = "Not Available in Desired Format";
  }
  return (
    <Fragment>
      <StartDownloadDialog
        contentInfo={contentEntry.contentInfo}
        mediaFormat={mediaFormat}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      <Tooltip title={tooltip}>
        {trigger ? (
          <Box
            onClick={buttonDisabled ? undefined : () => setDialogOpen(true)}
            sx={{
              cursor: buttonDisabled ? undefined : "pointer",
              opacity: buttonDisabled ? 0.6 : 1,
            }}
          >
            {trigger}
          </Box>
        ) : label ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center", 
              gap: 1,
              cursor: buttonDisabled ? undefined : "pointer", "&:hover": buttonDisabled ? undefined : { color: "primary.main" },
              color: buttonDisabled ? "text.disabled" : "text.primary",
            }}
            onClick={buttonDisabled ? undefined : () => setDialogOpen(true)}
          >
            <Typography>{buttonText}</Typography>
            <VariantIcon fontSize="small" />
          </Box>
        ) : (
          <div>
            <IconButton onClick={() => setDialogOpen(true)} disabled={buttonDisabled}>
              <VariantIcon fontSize="small" />
            </IconButton>
          </div>
        )}
      </Tooltip>
    </Fragment>
  );
};
