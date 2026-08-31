import { z } from "zod";
import { AiContentType } from "./ai-analysis.js";

/**
 * Grouping the game and platform names that come out of extraction.
 *
 * ## Why this is done on read rather than in the prompt
 *
 * `AiConsoleComparisonData.game` and `AiPlatformComparison.platform` are
 * free strings, and the extraction prompt deliberately does not constrain
 * them. Constraining it would produce tidier data but would make every
 * stored result a record of what the schema allowed rather than of what
 * the model actually said - and would invalidate everything already
 * extracted the moment the vocabulary changed.
 *
 * Grouping on read keeps stored results faithful, makes improving the
 * mapping free (nothing is re-analysed), and keeps the failure mode
 * visible: a name this does not recognise shows up as its own group
 * rather than being silently absorbed.
 *
 * ## Two mechanisms, deliberately kept apart
 *
 * `normaliseName` handles the mechanical differences - case, punctuation,
 * leading articles, trailing edition/version noise. It needs no
 * maintenance and cannot be wrong in an interesting way.
 *
 * `GAME_ALIASES`/`PLATFORM_ALIASES` handle genuine synonyms that no amount
 * of normalisation would join ("PlayStation 5" and "PS5" share almost no
 * characters). Every entry is a judgement someone made.
 *
 * They are separate because the split is the diagnostic: if grouping only
 * works because the alias list is long, the extraction vocabulary is the
 * real problem and constraining the prompt deserves reconsidering. If
 * normalisation does nearly all the work, the free-string approach is
 * fine. `GameGroup.mergedByAlias` is what makes that answerable from real
 * data instead of from opinion.
 */

/** Trailing noise that does not distinguish one game from another. */
const EDITION_SUFFIXES =
  /\b(remastered|remaster|definitive|deluxe|complete|goty|game of the year|edition|director'?s cut|redux|hd|4k|anniversary)\b/g;

/**
 * A comparison key, not a display name.
 *
 * Punctuation is dropped rather than normalised because it is the single
 * most common way two references to one game differ - "Halo: Campaign
 * Evolved" against "Halo Campaign Evolved" is a colon, nothing more.
 */
export const normaliseName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(EDITION_SUFFIXES, " ")
    .replace(/^(the|a|an)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Synonyms normalisation cannot join, keyed by normalised form.
 *
 * Deliberately short, and it should stay that way. This list existing at
 * all is fine; this list needing to be long would mean the extraction is
 * producing names too inconsistent to group, which is a different problem
 * and not one an alias map should be asked to solve.
 */
export const PLATFORM_ALIASES: Record<string, string> = {
  "playstation 5": "PS5",
  ps5: "PS5",
  "playstation 5 pro": "PS5 Pro",
  "ps5 pro": "PS5 Pro",
  "playstation 4": "PS4",
  ps4: "PS4",
  "xbox series x": "Xbox Series X",
  "series x": "Xbox Series X",
  "xbox series s": "Xbox Series S",
  "series s": "Xbox Series S",
  "xbox series x s": "Xbox Series X|S",
  "series x s": "Xbox Series X|S",
  "nintendo switch": "Switch",
  switch: "Switch",
  "nintendo switch 2": "Switch 2",
  "switch 2": "Switch 2",
  // Docked and handheld are genuinely different performance profiles, so
  // they are kept apart - but the four spellings the extraction produced
  // for those two concepts are not.
  "switch 2 docked": "Switch 2 (Docked)",
  "nintendo switch 2 docked": "Switch 2 (Docked)",
  "switch 2 portable": "Switch 2 (Handheld)",
  "switch 2 handheld": "Switch 2 (Handheld)",
  "nintendo switch 2 handheld": "Switch 2 (Handheld)",
  pc: "PC",
};

/**
 * The platforms a comparison table gets a column for.
 *
 * A fixed list rather than whatever the data happens to contain, because
 * the data contains things that are not platforms: the extraction has
 * produced entries like "General Issues Across All Platforms" - a section
 * heading read as a platform. Letting the columns be data-driven would
 * hand a junk value its own column across every row.
 *
 * Anything not listed here is not discarded; it is shown per-row instead,
 * so a genuinely new platform is visible rather than silently dropped and
 * a category error is visible rather than structural.
 */
export const TABLE_PLATFORMS = [
  "PS5",
  "PS5 Pro",
  "Xbox Series X",
  "Xbox Series S",
  "Switch 2",
  "Switch 2 (Docked)",
  "Switch 2 (Handheld)",
  "PC",
] as const;

export const isTablePlatform = (label: string): boolean =>
  (TABLE_PLATFORMS as readonly string[]).includes(label);

/**
 * Game-name synonyms.
 *
 * Empty on purpose. Entries belong here only once a real near-duplicate
 * has actually been observed in the library - guessing at them in advance
 * is how an alias map turns into a dumping ground that hides the very
 * signal it was meant to expose.
 */
export const GAME_ALIASES: Record<string, string> = {};

export type CanonicalName = {
  /** Grouping key. */
  key: string;
  /** What to show. */
  label: string;
  /** True when an explicit alias was needed, rather than normalisation alone. */
  viaAlias: boolean;
};

const canonicalise = (raw: string, aliases: Record<string, string>): CanonicalName => {
  const normalised = normaliseName(raw);
  const alias = aliases[normalised];
  return {
    key: alias ? normaliseName(alias) : normalised,
    label: alias ?? raw.trim(),
    viaAlias: Boolean(alias),
  };
};

export const canonicaliseGame = (raw: string): CanonicalName => canonicalise(raw, GAME_ALIASES);
export const canonicalisePlatform = (raw: string): CanonicalName => canonicalise(raw, PLATFORM_ALIASES);

/** One analysed video within a game group. */
export const GameIndexItem = z.object({
  contentKey: z.string(),
  title: z.string(),
  publishedDate: z.coerce.date(),
  contentType: AiContentType,
  /** The verdict or conclusion, shown verbatim - this is DF's judgement, not a derived one. */
  conclusion: z.string().nullish(),
  /** Canonical platform labels covered, for console comparisons. */
  platforms: z.array(z.string()).default([]),
  engine: z.string().nullish(),
  developer: z.string().nullish(),
  hasArticle: z.boolean().default(false),
  usedTranscript: z.boolean().default(false),
  /**
   * Whether this content is *about* this game, or merely covers it.
   *
   * A tech review of a game and a Direct that spent four minutes on it both
   * belong under that game, but they are not the same claim. Without this the
   * second would sit in the list looking like dedicated coverage, which
   * overstates what the archive actually holds on that title.
   */
  isPrimary: z.boolean().default(true),
});
export type GameIndexItem = z.infer<typeof GameIndexItem>;

export const GameGroup = z.object({
  key: z.string(),
  /** Display name - the longest raw spelling seen, which is usually the most complete. */
  name: z.string(),
  /**
   * Every distinct raw spelling that landed in this group.
   *
   * Kept and surfaced rather than discarded: more than one entry here is
   * the visible evidence that grouping did something, and is exactly what
   * has to be inspected to judge whether the extraction is consistent.
   */
  variants: z.array(z.string()).default([]),
  /** True when an explicit alias entry was required to form this group. */
  mergedByAlias: z.boolean().default(false),
  items: z.array(GameIndexItem).default([]),
});
export type GameGroup = z.infer<typeof GameGroup>;

/**
 * The response, carrying enough context to keep the reader honest about
 * what they are looking at.
 *
 * `analysedCount` and `libraryCount` are part of the payload rather than a
 * footnote because only analysed content appears here, and the owner
 * chooses what gets analysed - so this is never a view of the library, and
 * a page that implied otherwise would be misleading by construction.
 */
export const GameIndexResponse = z.object({
  groups: z.array(GameGroup).default([]),
  /** Analysed items that carried no game name, so appear in no group. */
  ungroupedCount: z.number().default(0),
  analysedCount: z.number().default(0),
  libraryCount: z.number().default(0),
});
export type GameIndexResponse = z.infer<typeof GameIndexResponse>;
