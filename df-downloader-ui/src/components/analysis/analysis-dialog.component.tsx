import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CloseIcon from "@mui/icons-material/Close";
import { Box, Button, Divider, IconButton, Stack, Typography } from "@mui/material";
import { AiAnalysisConfigUtils } from "df-downloader-common/config/ai-analysis-config";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { queryConfigSection } from "../../store/config/config.action.ts";
import { selectConfigSection } from "../../store/config/config.selector.ts";
import { store } from "../../store/store.ts";
import { AiAnalysisPanel } from "../df-content/ai-analysis/ai-analysis-panel.component.tsx";
import { MiddleModal } from "../general/middle-modal.component.tsx";

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
export type AnalysisDialogProps = {
  contentKey: string | null;
  title?: string;
  onClose: () => void;
  /** Opens the full content detail view for this item. */
  onOpenContent: (contentKey: string) => void;
};

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
      <Box sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
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

        <Divider sx={{ mb: 2 }} />

        {contentKey && <AiAnalysisPanel contentKey={contentKey} enabled={enabled} />}

        <Divider sx={{ mt: 2, mb: 1.5 }} />

        <Button
          size="small"
          startIcon={<OpenInNewIcon fontSize="small" />}
          onClick={() => contentKey && onOpenContent(contentKey)}
        >
          Content details, downloads and formats
        </Button>
      </Box>
    </MiddleModal>
  );
};
