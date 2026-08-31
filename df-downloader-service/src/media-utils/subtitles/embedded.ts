import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { describeExit } from "../../utils/command.js";

/**
 * Subtitle codecs that can become WebVTT.
 *
 * An allowlist rather than a denylist of the bitmap formats, because getting
 * this wrong fails in the worst way available: ffmpeg exits non-zero, the
 * track loads as empty, and the player shows a subtitle option that silently
 * does nothing. Anything unrecognised is better left unoffered.
 *
 * The bitmap formats deliberately absent - PGS, DVD and DVB subs - are
 * pictures of text. Converting them needs OCR, which is a different feature
 * with different failure modes, not a codec argument.
 */
const TEXT_SUBTITLE_CODECS = new Set([
  "subrip",
  "srt",
  "ass",
  "ssa",
  "mov_text",
  "webvtt",
  "text",
  "subviewer",
  "subviewer1",
  "microdvd",
  "mpl2",
  "jacosub",
  "sami",
  "realtext",
  "stl",
  "pjs",
  "vplayer",
  "eia_608",
]);

export const isConvertibleSubtitleCodec = (codecName?: string): boolean =>
  Boolean(codecName && TEXT_SUBTITLE_CODECS.has(codecName.toLowerCase()));

/**
 * One embedded subtitle stream, as WebVTT.
 *
 * Buffered rather than piped straight to the response: subtitles are small,
 * and streaming would mean a failure part-way arrives after the headers say
 * 200, which reads to the browser as a valid but truncated track.
 */
export const extractEmbeddedSubtitlesAsVtt = async (
  filePath: string,
  streamIndex: number,
  timeoutMs = 30000
): Promise<string> => {
  const args = ["-i", filePath, "-map", `0:${streamIndex}`, "-f", "webvtt", "-"];
  const proc = spawn(ffmpegPath as unknown as string, args);
  const chunks: Buffer[] = [];
  let stderr = "";

  const killTimer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    return await new Promise<string>((resolve, reject) => {
      proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      // Bounded, as elsewhere: a failing ffmpeg can be very talkative.
      proc.stderr.on("data", (chunk) => (stderr = `${stderr}${chunk}`.slice(-4096)));
      proc.on("error", reject);
      proc.on("close", (code, signal) => {
        if (code !== 0) {
          const detail = stderr.trim();
          return reject(new Error(`${describeExit("ffmpeg", code, signal)}${detail ? `: ${detail}` : ""}`));
        }
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });
  } finally {
    clearTimeout(killTimer);
  }
};
