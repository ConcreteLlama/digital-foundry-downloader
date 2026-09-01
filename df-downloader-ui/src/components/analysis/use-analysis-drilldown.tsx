import { Box } from "@mui/material";
import { ReactNode, useCallback, useState } from "react";
import { DfContentInfoItemDetail } from "../df-content/df-content-item-detail/df-content-item-detail.component.tsx";
import { MiddleModal } from "../general/middle-modal.component.tsx";
import { AnalysisDialog } from "./analysis-dialog.component.tsx";

/**
 * The way from a cross-content view into one item: its analysis, and from
 * there the item itself.
 *
 * Every page in this section needs the same two layers - read the analysis
 * first, step out to the content details second - and each was carrying its
 * own pair of state variables, dialog and modal. Two pages had it, three did
 * not, which is why a settings table could show you a row it had no way of
 * opening.
 */
export type AnalysisDrilldown = {
  /** Opens the analysis for one item. Title is shown while it loads. */
  openAnalysis: (contentKey: string, title?: string) => void;
  /** Opens the content itself, optionally at a moment in the video. */
  openContent: (contentKey: string, startAtSeconds?: number) => void;
  /** Render once, anywhere in the page. */
  dialogs: ReactNode;
};

export const useAnalysisDrilldown = (idPrefix: string): AnalysisDrilldown => {
  const [analysis, setAnalysis] = useState<{ key: string; title?: string } | null>(null);
  const [content, setContent] = useState<{ key: string; startAtSeconds?: number } | null>(null);

  const openAnalysis = useCallback((contentKey: string, title?: string) => {
    setAnalysis({ key: contentKey, title });
  }, []);

  const openContent = useCallback((contentKey: string, startAtSeconds?: number) => {
    // The analysis closes as the content opens: they answer the same question
    // at different depths, and stacking two modals leaves no clear way back.
    setAnalysis(null);
    setContent({ key: contentKey, startAtSeconds });
  }, []);

  const dialogs = (
    <>
      <AnalysisDialog
        contentKey={analysis?.key ?? null}
        title={analysis?.title}
        onClose={() => setAnalysis(null)}
        onOpenContent={openContent}
      />

      <MiddleModal
        open={Boolean(content)}
        onClose={() => setContent(null)}
        id={`${idPrefix}-content-modal`}
        hideCloseButton
      >
        <Box>
          <DfContentInfoItemDetail
            dfContentName={content?.key || ""}
            startAtSeconds={content?.startAtSeconds}
            onClose={() => setContent(null)}
          />
        </Box>
      </MiddleModal>
    </>
  );

  return { openAnalysis, openContent, dialogs };
};
