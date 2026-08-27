export const commaSeparatedToArray = (csv: any) => {
  if (typeof csv !== "string") {
    return;
  }
  return csv.split(",").map((val) => val.trim());
};

const MEDIA_UNSAFE_CHARS = /[^a-z0-9  ,\\.!\\-\\[\\]\\?]/gi;

/**
 * For single-line metadata fields (title, genre) - flattens newlines to
 * spaces, since nothing displays those across multiple lines anyway.
 */
export const mediaSanitise = (data: string) => {
  return data.replace(/\n/gi, " ").replace(MEDIA_UNSAFE_CHARS, "");
};

/**
 * For metadata fields that are genuinely prose (description/synopsis),
 * keeping paragraph breaks instead of flattening everything into one
 * run-on block.
 *
 * mediaSanitise's newline-to-space replacement was the only thing mangling
 * embedded descriptions: MP4 metadata round-trips "\n" through ffmpeg
 * unchanged (verified directly), and runCommand spawns without a shell, so
 * newlines inside an argument reach ffmpeg verbatim. Neither the container
 * nor the players ever required that flattening.
 */
export const mediaSanitiseMultiline = (data: string) => {
  return data
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(MEDIA_UNSAFE_CHARS, "").trimEnd())
    .join("\n")
    // Collapse runs of blank lines so a gap in the source doesn't become a
    // block of whitespace in a player's description panel.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};
