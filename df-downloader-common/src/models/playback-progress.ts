import { z } from "zod";

/**
 * The in-app player saying where it has got to.
 *
 * Reported to this app rather than straight to a media server on purpose: the
 * player should not know or care which servers are configured, and routing it
 * through here leaves room to remember progress locally later without changing
 * what the player sends.
 */
export const PlaybackProgressRequest = z.object({
  positionSeconds: z.number().min(0),
  durationSeconds: z.number().min(0),
});
export type PlaybackProgressRequest = z.infer<typeof PlaybackProgressRequest>;
