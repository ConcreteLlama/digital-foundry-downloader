import { SubtitlesConfig } from "../../config/subtitles-config.js";

/**
 * Steps a download pipeline is known NOT to need, from configuration alone.
 *
 * Some steps genuinely cannot be predicted - Fetch Chapters depends on whether
 * YouTube has any, Inject Metadata on whether anything turned up to inject.
 * Those stay "pending" until they either run or are skipped at runtime. These
 * two, though, are decided entirely by settings that are already known, so
 * showing them as ordinary upcoming steps overstates what the pipeline is
 * going to do.
 *
 * Lives here rather than in the service so the reasons are part of the
 * contract the UI renders, not a string invented at the edge.
 */
export const getDownloadStepNotApplicableReasons = (
  subtitles: SubtitlesConfig | undefined
): Record<string, string> => {
  const reasons: Record<string, string> = {};

  // Only during_download generates inline; after_download runs once the file
  // is filed (as its own pipeline), and off never does.
  const generatesInline = subtitles?.automaticGeneration === "during_download";
  if (!generatesInline) {
    reasons["Generate Subtitles"] =
      subtitles?.automaticGeneration === "after_download"
        ? "Subtitles are generated after the download completes, as a separate job"
        : "Automatic subtitle generation is switched off";
  }

  // Writing a sidecar needs subtitles to exist in the first place, and then
  // needs either sidecar output or keepTranscript. With the default "auto"
  // output a fresh download embeds them while assembling the file, so no .srt
  // is written at all.
  if (!generatesInline) {
    reasons["Write Subtitles"] = "No subtitles are generated during this download";
  } else if (subtitles?.output !== "sidecar" && !subtitles?.keepTranscript) {
    reasons["Write Subtitles"] =
      "Subtitles are embedded in the video rather than written alongside it - turn on \"keep transcript\" to get both";
  }

  return reasons;
};
