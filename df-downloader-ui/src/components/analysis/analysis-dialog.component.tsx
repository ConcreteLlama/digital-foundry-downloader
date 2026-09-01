import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CloseIcon from "@mui/icons-material/Close";
import { Box, Button, Divider, IconButton, Paper, Stack, Typography, styled } from "@mui/material";
import { AiAnalysisConfigUtils } from "df-downloader-common/config/ai-analysis-config";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { queryConfigSection } from "../../store/config/config.action.ts";
import { selectConfigSection } from "../../store/config/config.selector.ts";
import { store } from "../../store/store.ts";
import { AiAnalysisPanel } from "../df-content/ai-analysis/ai-analysis-panel.component.tsx";
import { MiddleModal } from "../general/middle-modal.component.tsx";

/**
 * The dialog's own surface.
 *
 * MiddleModal positions its child but does not paint anything, so a child
 * that is only a Box renders as transparent text over whatever is behind
 * it - which is what a plain Box here produced. Same treatment as the
 * content detail panel: a Paper with responsive padding, no horizontal
 * overflow, and a height cap so a long analysis scrolls inside the dialog
 * rather than running off the screen.
 */
const AnalysisDialogSurface = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  paddingTop: theme.spacing(2),
  display: "flex",
  flexDirection: "column",
  maxWidth: "100%",
  // The surface itself never scrolls - its middle section does. A sticky
  // header inside a scrolling padded box only paints its own bounds, so
  // content passed through the padding strip above it.
  overflow: "hidden",
  maxHeight: "85vh",
  [theme.breakpoints.down("md")]: {
    padding: theme.spacing(2),
    paddingTop: theme.spacing(1.5),
  },
  [theme.breakpoints.down("sm")]: {
    padding: theme.spacing(1.5),
    paddingTop: theme.spacing(1),
  },
}));

export type AnalysisDialogProps = {
  contentKey: string | null;
  title?: string;
  onClose: () => void;
  /**
   * Opens the full content detail view for this item, optionally at a moment
   * in the video - which is how a finding's timestamp becomes clickable here.
   */
  onOpenContent: (contentKey: string, startAtSeconds?: number) => void;
};

/**
 * The analysis for one item, on its own.
 *
 * The cross-content views used to open the full content detail dialog,
 * which answers a different question: that panel leads with the thumbnail,
 * formats, download state and task history, and the analysis sits well
 * down it. Arriving from a comparison table you already know what the
 * video is - you came to read what was found in it - so this shows the
 * analysis first and offers the content details as a step out rather than
 * making them the destination.
 */
export const AnalysisDialog = ({ contentKey, title, onClose, onOpenContent }: AnalysisDialogProps) => {
  // Config sections load per-consumer, so a component that reads one has to
  // ask for it - otherwise the panel reports the feature as switched off to
  // anyone who has not opened its settings page this session.
  useEffect(() => {
    store.dispatch(queryConfigSection.start("aiAnalysis"));
  }, []);
  const aiAnalysisConfig = useSelector(selectConfigSection("aiAnalysis"));
  const enabled = AiAnalysisConfigUtils.isUsable(aiAnalysisConfig ?? undefined);

  return (
    <MiddleModal open={Boolean(contentKey)} onClose={onClose} id="analysis-dialog" hideCloseButton>
      <AnalysisDialogSurface elevation={8}>
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1, flex: "0 0 auto" }}>
          <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: "text.disabled" }}>
              Analysis
            </Typography>
            {title && (
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                {title}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Divider sx={{ flex: "0 0 auto" }} />

        {/* The only scrolling region. Keeping the header and the way out
            of the dialog fixed means neither is lost part-way down a long
            analysis. */}
        <Box sx={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", overflowX: "hidden", py: 2 }}>
          {contentKey && (
            <AiAnalysisPanel
              contentKey={contentKey}
              enabled={enabled}
              /*
               * The content view seeks its own player in place; there is no
               * player here, so the equivalent is to open the content at that
               * moment. Without this the panel renders no timestamps at all,
               * which read as findings that simply had none.
               */
              onJumpTo={(seconds) => onOpenContent(contentKey, seconds)}
            />
          )}
        </Box>

        <Divider sx={{ flex: "0 0 auto" }} />

        <Box sx={{ flex: "0 0 auto", pt: 1 }}>
          <Button
            size="small"
            startIcon={<OpenInNewIcon fontSize="small" />}
            onClick={() => contentKey && onOpenContent(contentKey)}
          >
            Content details, downloads and formats
          </Button>
        </Box>
      </AnalysisDialogSurface>
    </MiddleModal>
  );
};
