import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
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
import { getPlaybackOpenInLinks } from "../../../api/playback.ts";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useState } from "react";
import { useSelector } from "react-redux";
import { API_URL } from "../../../config.ts";
import { selectQueryPipelineIds } from "../../../store/df-tasks/tasks.selector.ts";
import { postJson } from "../../../utils/fetch.ts";
import { DeleteDownloadDialog } from "./delete-download-dialog.component.tsx";
import { EditMetadataDialog } from "./edit-metadata-dialog.component.tsx";
import { GenerateSubtitlesDialog } from "./generate-subtitles-dialog.component.tsx";
import { VideoPlayerDialog } from "./video-player-dialog.component.tsx";

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
  /**
   * Called when the player opens and again when it closes.
   *
   * These actions render inside the file-details dialog as well as in the
   * row menu, and playing from in there left that dialog sitting over the
   * video with its buttons intercepting clicks meant for playback. The host
   * has to get out of the way - but it cannot simply close, because the
   * player lives inside it and closing would unmount the thing that just
   * opened. Standing aside and coming back is both the fix and the better
   * behaviour: closing the player returns you to the file you came from.
   */
  onPlayerOpenChange?: (open: boolean) => void;
};

export const DownloadedItemActions = ({
  contentEntry,
  download,
  variant = "menu",
  onPlayerOpenChange,
}: DownloadedItemActionsProps) => {
  const [subtitlesDialogOpen, setSubtitlesDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editMetadataDialogOpen, setEditMetadataDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  /*
   * Where else this can be watched, looked up only when asked for.
   *
   * Neither Plex nor Jellyfin can find an item by path, so answering means
   * the server reading back its library - far too much to spend on every row
   * of a list on the chance somebody wants it. One deliberate click, one
   * lookup.
   */
  const [openInOpen, setOpenInOpen] = useState(false);
  const [openInLinks, setOpenInLinks] = useState<{ server: string; url: string }[] | undefined>();
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
  // Audio downloads play in the same element, so playback is not video-only -
  // an archive is the thing there is nothing to play in. Whether the codec is
  // actually decodable is decided in the browser when the player opens, not
  // here: it depends on the machine, not on the file (see VideoPlayerDialog).
  const downloadIsPlayable = downloadIsVideo || download.mediaInfo.type === "AUDIO";

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
      key: "play",
      label: "Play",
      icon: PlayArrowIcon,
      run: () => {
        setPlayerOpen(true);
        onPlayerOpenChange?.(true);
      },
      disabled: !downloadIsPlayable,
      reason: !downloadIsPlayable ? "Nothing to play in this kind of file" : undefined,
    },
    {
      /*
       * Beside Play rather than inside the player, and deliberately: watching
       * it in the app it is already in is an alternative to opening our
       * player, not something to discover once you are in it. On a phone it
       * is often the better choice - a client built for the job, no
       * re-encoding - and play state syncs both ways, so it picks up where
       * you left off.
       */
      key: "open-in",
      label: "Watch elsewhere",
      icon: OpenInNewIcon,
      run: () => {
        setOpenInOpen(true);
        if (openInLinks === undefined) {
          void getPlaybackOpenInLinks(contentEntry.key, download.downloadLocation)
            .then(setOpenInLinks)
            // An empty list either way: a server that cannot answer and one
            // with nothing to offer are the same thing to look at.
            .catch(() => setOpenInLinks([]));
        }
      },
      disabled: !downloadIsPlayable,
      reason: !downloadIsPlayable ? "Nothing to play in this kind of file" : undefined,
    },
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
      <Dialog open={openInOpen} onClose={() => setOpenInOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Watch elsewhere</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ paddingTop: 1 }}>
            {openInLinks === undefined && <Typography variant="body2">Looking for it on your media servers...</Typography>}
            {openInLinks?.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                None of your media servers has this file indexed yet. A recent download may not have been scanned, and a
                server needs to be signed in rather than only holding an API key.
              </Typography>
            )}
            {openInLinks?.map((link) => (
              <Button
                key={link.server}
                variant="outlined"
                component="a"
                href={link.url}
                target="_blank"
                rel="noreferrer"
                startIcon={<OpenInNewIcon />}
                onClick={() => setOpenInOpen(false)}
              >
                Open in {link.server}
              </Button>
            ))}
            {openInLinks && openInLinks.length > 0 && (
              <Typography variant="caption" color="text.disabled">
                Opens the server's web player. It will not launch the phone app - an app can only claim links for
                addresses known when it was built, which a server on your own network is not.
              </Typography>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
      <VideoPlayerDialog
        open={playerOpen}
        onClose={() => {
          setPlayerOpen(false);
          onPlayerOpenChange?.(false);
        }}
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
