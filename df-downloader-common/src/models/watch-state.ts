import { z } from "zod";

/**
 * Where a piece of watch state came from.
 *
 * Kept on the record rather than inferred, because the merge rule needs to
 * tell "this app's own player said so" from "Plex said so" when deciding what
 * to do with a disagreement, and because a log line saying which server moved
 * something is the only way anyone diagnoses a surprising jump.
 */
export const WatchStateSource = z.enum(["local", "plex", "jellyfin"]);
export type WatchStateSource = z.infer<typeof WatchStateSource>;

/** How far through counts as watched. Matches what Plex and Jellyfin use themselves. */
export const WATCHED_FRACTION = 0.9;

/**
 * What this app knows about whether you have seen something.
 *
 * First-class rather than a cache of a media server: most installs have
 * neither Plex nor Jellyfin connected, and "have I seen this" is worth
 * answering on its own. Plex and Jellyfin are additional *sources* that feed
 * into this, not the place it lives.
 */
export const WatchState = z.object({
  /** Mirrors DfContentEntry.key. */
  contentKey: z.string(),
  watched: z.boolean().default(false),
  /**
   * Where you got to, in seconds.
   *
   * Kept even once watched, because "watched, and you stopped two minutes
   * before the end" is still the right place to resume from if you go back.
   */
  positionSeconds: z.number().min(0).default(0),
  /**
   * Total length, when whatever reported the position knew it.
   *
   * Needed to turn a position into a percentage without going back to the
   * file, and absent for a state that arrived from a server that did not say.
   */
  durationSeconds: z.number().min(0).optional(),
  /** When this state was last actually changed - the basis for merging. */
  updatedAt: z.coerce.date(),
  /** What last changed it. */
  source: WatchStateSource,
});
export type WatchState = z.infer<typeof WatchState>;

/**
 * Decides which of two states about the same content wins.
 *
 * Two rules, and both exist because of how the disagreements actually arise:
 *
 * 1. **Watched is sticky.** If anything says you watched it, you watched it.
 *    Servers disagree constantly in the ordinary case - you finish something
 *    in Plex, and Jellyfin has never heard of it - and the alternative,
 *    letting the most recent poll unset it, means a server that does not know
 *    about a file can un-watch something you definitely saw.
 *
 * 2. **Position takes the newest.** Unlike watched, position is genuinely
 *    a moving value, and the most recently reported one is the best guess at
 *    where you actually are. Ties go to the incoming state, since it is the
 *    one that just did work to tell us.
 *
 * Lives in common so the service's merge and any future UI-side optimism
 * demonstrably apply the same rule.
 */
export const mergeWatchState = (existing: WatchState | undefined, incoming: WatchState): WatchState => {
  if (!existing) {
    return incoming;
  }
  const incomingIsNewer = incoming.updatedAt.getTime() >= existing.updatedAt.getTime();
  const newer = incomingIsNewer ? incoming : existing;
  return {
    contentKey: existing.contentKey,
    watched: existing.watched || incoming.watched,
    positionSeconds: newer.positionSeconds,
    durationSeconds: newer.durationSeconds ?? existing.durationSeconds ?? incoming.durationSeconds,
    updatedAt: newer.updatedAt,
    source: newer.source,
  };
};

/**
 * Whether a position is far enough through to count as watched.
 *
 * Shared so the player, the service and anything reading a server all draw
 * the line in the same place.
 */
export const isWatchedPosition = (positionSeconds: number, durationSeconds?: number) =>
  durationSeconds !== undefined && durationSeconds > 0 && positionSeconds / durationSeconds >= WATCHED_FRACTION;

/**
 * How far in counts as actually started.
 *
 * Opening something, realising it is the wrong one and closing it should not
 * leave the row looking half-watched for ever.
 */
export const STARTED_FRACTION = 0.02;

/** The three states worth drawing or filtering on. */
export const WatchStateCategory = z.enum(["watched", "inProgress", "unwatched"]);
export type WatchStateCategory = z.infer<typeof WatchStateCategory>;

/**
 * Which of the three a piece of content is in.
 *
 * One rule, used by the row badge, the grid card's progress bar and the
 * server-side filter - so a row cannot show a part-watched ring while the
 * "in progress" filter disagrees about it.
 */
export const watchStateCategory = (
  state?: Pick<WatchState, "watched" | "positionSeconds" | "durationSeconds">
): WatchStateCategory => {
  if (!state) {
    return "unwatched";
  }
  if (state.watched) {
    return "watched";
  }
  const fraction =
    state.durationSeconds && state.durationSeconds > 0 ? state.positionSeconds / state.durationSeconds : 0;
  return fraction > STARTED_FRACTION ? "inProgress" : "unwatched";
};

/**
 * What one server contributed to a sync.
 *
 * `matched` against `asked` is the number that actually diagnoses this: a
 * server that answers happily and recognises none of the files is the exact
 * signature of a wrong path mapping, and it is indistinguishable from
 * "nothing to do" unless both numbers are reported.
 */
export const WatchStateSyncServerResult = z.object({
  source: WatchStateSource,
  asked: z.number(),
  matched: z.number(),
});
export type WatchStateSyncServerResult = z.infer<typeof WatchStateSyncServerResult>;

export const WatchStateSyncResult = z.object({
  /** False when it was skipped - no servers configured, or one already running. */
  ran: z.boolean(),
  changed: z.number(),
  servers: WatchStateSyncServerResult.array().default([]),
});
export type WatchStateSyncResult = z.infer<typeof WatchStateSyncResult>;

/** Marking something watched or unwatched by hand, from the content view. */
export const SetWatchStateRequest = z.object({
  watched: z.boolean().optional(),
  positionSeconds: z.number().min(0).optional(),
  durationSeconds: z.number().min(0).optional(),
});
export type SetWatchStateRequest = z.infer<typeof SetWatchStateRequest>;

export const WatchStateResponse = z.object({
  watchState: WatchState.optional(),
});
export type WatchStateResponse = z.infer<typeof WatchStateResponse>;

export const WatchStateListResponse = z.object({
  watchStates: WatchState.array(),
});
export type WatchStateListResponse = z.infer<typeof WatchStateListResponse>;
