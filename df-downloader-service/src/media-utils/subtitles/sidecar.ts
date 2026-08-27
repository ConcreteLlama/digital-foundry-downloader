import { logger } from "df-downloader-common";
import { SubtitlesOutputMode } from "df-downloader-common/config/subtitles-config.js";
import fs from "fs";
import path from "path";
import { generateSrt, languageToSubsLanguage } from "./srt-utils.js";
import { GeneratedSubtitleInfo } from "./subtitles.js";

/**
 * Writes subtitles as a separate .srt beside the video.
 *
 * Named `<video basename>.<language>.srt`, which is what Plex and Jellyfin
 * both look for - the language suffix is what lets them label the track
 * rather than showing it as "Unknown".
 *
 * Written to a temporary dotfile and renamed, for the same reason the remux
 * does: the destination is a directory a media server is watching, and a
 * partially written subtitle file appearing there would be picked up
 * mid-write. The rename is same-directory and therefore atomic.
 */
export const writeSubtitleSidecar = async (videoPath: string, subtitles: GeneratedSubtitleInfo) => {
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  const language = languageToSubsLanguage(subtitles.language) || subtitles.language;
  const sidecarPath = path.join(dir, `${base}.${language}.srt`);
  const tempPath = path.join(dir, `.df-downloader-tmp-${path.basename(sidecarPath)}`);
  await fs.promises.mkdir(dir, { recursive: true });
  try {
    await fs.promises.writeFile(tempPath, generateSrt(subtitles.lines), { encoding: "utf-8" });
    await fs.promises.rename(tempPath, sidecarPath);
  } catch (e) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw e;
  }
  logger.log("info", `Wrote subtitles to ${sidecarPath}`);
  return sidecarPath;
};

/**
 * Resolves the configured output mode for a particular situation.
 *
 * `auto` means "embed if it's free, sidecar if it isn't". It's free while the
 * download is still being assembled, because the file is being written
 * anyway and nothing has seen it yet. It isn't once the file is in the
 * library: embedding then means rewriting a multi-gigabyte file that a media
 * server has indexed and may be streaming.
 */
export const resolveSubtitlesOutput = (
  configured: SubtitlesOutputMode,
  situation: "assembling_download" | "existing_file"
): "embed" | "sidecar" => {
  if (configured !== "auto") {
    return configured;
  }
  return situation === "assembling_download" ? "embed" : "sidecar";
};
