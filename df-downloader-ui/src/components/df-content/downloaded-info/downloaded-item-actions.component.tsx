import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import RefreshIcon from "@mui/icons-material/Refresh";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import {
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { DfContentEntry, DfContentUpdateDownloadMetaRequest } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useState } from "react";
import { useSelector } from "react-redux";
import { API_URL } from "../../../config.ts";
import { selectQueryPipelineIds } from "../../../store/df-tasks/tasks.selector.ts";
import { postJson } from "../../../utils/fetch.ts";
import { DeleteDownloadDialog } from "./delete-download-dialog.component.tsx";
import { EditMetadataDialog } from "./edit-metadata-dialog.component.tsx";
import { GenerateSubtitlesDialog } from "./generate-subtitles-dialog.component.tsx";

type DownloadedItemActionsProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
  /**
   * "menu" collapses to a single overflow button - four icon buttons claimed
   * ~150px of a side column barely 300px wide, which is what was squeezing the
   * filename next to them into ellipsis. "buttons" spells them out for the
   * details dialog, where there is room and where labels beat guessing at
   * icons.
   */
  variant?: "menu" | "buttons";
};

export const DownloadedItemActions = ({
  contentEntry,
  download,
  variant = "menu",
}: DownloadedItemActionsProps) => {
  const [subtitlesDialogOpen, setSubtitlesDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editMetadataDialogOpen, setEditMetadataDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const currentActiveTaskPipelines = useSelector(
    selectQueryPipelineIds({
      filter: {
        contentName: contentEntry.key,
        state: "incomplete",
      },
    })
  );
  const updatesDisabled = currentActiveTaskPipelines.length > 0;
  const downloadIsVideo = download.mediaInfo.type === "VIDEO";

  const refreshDownloadMetadata = async () => {
    const requestBody: DfContentUpdateDownloadMetaRequest = {
      contentName: contentEntry.key,
      filename: download.downloadLocation,
    };
    postJson(`${API_URL}/content/downloads/update-metadata`, requestBody).catch((error) => {
      console.error("Failed to refresh metadata", error);
    });
  };

  const actions = [
    {
      key: "subtitles",
      label: "Generate subtitles",
      icon: SubtitlesIcon,
      run: () => setSubtitlesDialogOpen(true),
      disabled: !downloadIsVideo || updatesDisabled,
      reason: !downloadIsVideo
        ? "Cannot generate subtitles for non-video media"
        : updatesDisabled
        ? "Disabled while task pipelines are running"
        : undefined,
    },
    {
      key: "refresh",
      label: "Refresh metadata",
      icon: RefreshIcon,
      run: refreshDownloadMetadata,
      disabled: updatesDisabled,
      reason: updatesDisabled ? "Disabled while task pipelines are running" : undefined,
    },
    {
      key: "edit",
      label: "Edit metadata",
      icon: EditIcon,
      run: () => setEditMetadataDialogOpen(true),
      disabled: updatesDisabled,
      reason: updatesDisabled ? "Disabled while task pipelines are running" : undefined,
    },
    {
      key: "delete",
      label: "Delete",
      icon: DeleteIcon,
      run: () => setDeleteDialogOpen(true),
      disabled: updatesDisabled,
      reason: updatesDisabled ? "Disabled while task pipelines are running" : undefined,
      destructive: true,
    },
  ];

  const dialogs = (
    <>
      <DeleteDownloadDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        contentEntry={contentEntry}
        download={download}
      />
      <GenerateSubtitlesDialog
        open={subtitlesDialogOpen}
        onClose={() => setSubtitlesDialogOpen(false)}
        contentEntry={contentEntry}
        download={download}
      />
      <EditMetadataDialog
        open={editMetadataDialogOpen}
        onClose={() => setEditMetadataDialogOpen(false)}
        contentEntry={contentEntry}
        download={download}
      />
    </>
  );

  if (variant === "buttons") {
    return (
      <>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }} useFlexGap>
          {actions.map(({ key, label, icon: Icon, run, disabled, reason, destructive }) => (
            <Tooltip key={key} title={reason ?? ""} disableHoverListener={!reason}>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  color={destructive ? "error" : "inherit"}
                  disabled={disabled}
                  startIcon={<Icon />}
                  onClick={run}
                >
                  {label}
                </Button>
              </span>
            </Tooltip>
          ))}
        </Stack>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <Tooltip title="File actions">
        <IconButton
          aria-label="File actions"
          // 36px rather than the 30px `size="small"` gives, because this is now
          // the ONLY way to reach these actions and the app is used on a phone.
          sx={{ width: 36, height: 36 }}
          onClick={(event) => {
            // The row itself opens the file details - the menu button must not
            // also do that on its way past.
            event.stopPropagation();
            setMenuAnchor(event.currentTarget);
          }}
        >
          <MoreVertIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        // Menus render through a portal, but React still bubbles the event up
        // the component tree to the row underneath.
        onClick={(event) => event.stopPropagation()}
      >
        {actions.map(({ key, label, icon: Icon, run, disabled, reason, destructive }) => (
          <MenuItem
            key={key}
            disabled={disabled}
            onClick={() => {
              setMenuAnchor(null);
              run();
            }}
            sx={destructive ? { color: "error.main" } : undefined}
          >
            <ListItemIcon sx={destructive ? { color: "error.main" } : undefined}>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={label}
              secondary={
                // A disabled MenuItem swallows hover, so a tooltip would never
                // fire - the reason has to be written down instead.
                disabled && reason ? (
                  <Typography variant="caption" color="text.disabled">
                    {reason}
                  </Typography>
                ) : undefined
              }
            />
          </MenuItem>
        ))}
      </Menu>
      {dialogs}
    </>
  );
};
