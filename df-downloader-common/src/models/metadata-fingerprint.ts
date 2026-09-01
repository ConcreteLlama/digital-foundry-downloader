import { DfContentInfo } from "./df-content-info.js";

/**
 * A short stand-in for "the metadata currently embedded in a file".
 *
 * Without something like this there is no way to ask whether a file's
 * metadata is out of date: a file holding exactly what would be written now
 * is indistinguishable from one written before any of it existed, so a
 * metadata backfill can only ever offer "every downloaded item" and the user
 * has to rewrite the whole library to catch the few that changed.
 *
 * It is a change detector, not a checksum of the file - it is computed from
 * the same fields the writer embeds, stored when the write succeeds, and
 * compared against the same fields later. FNV-1a rather than a real hash
 * because nothing here is adversarial; it only has to differ when the inputs
 * differ.
 */

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    // The FNV prime, via shifts - a plain multiply overflows into a float
    // and stops being a 32-bit hash.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/**
 * The fields that actually reach the file, in a stable order.
 *
 * Tags are sorted and lowercased because neither their order nor their casing
 * survives into anything a reader distinguishes - treating a reordering as a
 * change would mark items stale that nothing would rewrite.
 */
export const metadataFingerprintOf = (input: {
  title?: string;
  publishedDate?: Date;
  description?: string;
  tags?: string[];
}): string => {
  const tags = [...(input.tags ?? [])].map((tag) => tag.trim().toLowerCase()).sort();
  return fnv1a(
    [
      input.title ?? "",
      input.publishedDate ? String(new Date(input.publishedDate).getFullYear()) : "",
      input.description ?? "",
      tags.join(","),
    ].join("\u0000")
  );
};

/**
 * The tags a write would embed: the content's own, plus any accepted AI tags.
 *
 * Both, because a metadata run merges accepted analysis tags in whether or not
 * they were ever applied to the content - so comparing against the content's
 * tags alone reports a file as out of date immediately after writing it.
 *
 * Case-insensitive union, matching how tags are applied elsewhere: the model
 * does not know the existing tags and will re-propose one that differs only in
 * casing.
 */
export const tagsForWriting = (contentTags?: string[], acceptedTags?: string[]): string[] => {
  const existing = contentTags ?? [];
  const seen = new Set(existing.map((tag) => tag.toLowerCase()));
  return [...existing, ...(acceptedTags ?? []).filter((tag) => !seen.has(tag.toLowerCase()))];
};

/**
 * What writing this content's metadata now would embed.
 *
 * `acceptedTags` comes from the analysis index; omit it only where there is
 * genuinely no analysis to consider.
 */
export const currentMetadataFingerprint = (contentInfo: DfContentInfo, acceptedTags?: string[]): string =>
  metadataFingerprintOf({
    title: contentInfo.title,
    publishedDate: contentInfo.publishedDate,
    description: contentInfo.description,
    tags: tagsForWriting(contentInfo.tags, acceptedTags),
  });
