import { z } from "zod";
import {
  JellyfinMediaServerConfig,
  JellyfinServerKey,
  PlexMediaServerConfig,
  PlexServerKey,
} from "../config/media-servers-config.js";

/**
 * Tests one media server against settings that have not been saved yet.
 *
 * Carries only what a connection needs - the URL and the credential - for one
 * server.
 *
 * Two deadlocks came from carrying more than this. Sending both servers meant
 * testing Plex validated Jellyfin too, and failed on a server the user was not
 * asking about. Sending the path mapping was worse: the mapping cannot be
 * filled in until a successful test has listed the server's own folders, so
 * requiring a valid mapping in order to test made both impossible at once.
 */
export const TestMediaServerRequest = z.discriminatedUnion("type", [
  z.object({ type: z.literal(PlexServerKey), config: PlexMediaServerConfig.pick({ url: true, token: true }) }),
  z.object({
    type: z.literal(JellyfinServerKey),
    config: JellyfinMediaServerConfig.pick({ url: true, apiKey: true }),
  }),
]);
export type TestMediaServerRequest = z.infer<typeof TestMediaServerRequest>;

/** A library as the server itself reports it, used to offer real paths rather than asking someone to type one. */
export const MediaServerLibrary = z.object({
  title: z.string(),
  locations: z.array(z.string()),
});
export type MediaServerLibrary = z.infer<typeof MediaServerLibrary>;

export const TestMediaServerResponse = z.object({
  ok: z.boolean(),
  /**
   * What the server says its libraries are, when it will tell us.
   *
   * Returned so the path-mapping field can offer the server's own paths as
   * options. Typing one by hand is the single most likely way to configure
   * this wrongly, and a wrong path fails silently.
   */
  libraries: z.array(MediaServerLibrary).optional(),
  /** What was found when it worked - server name, or the libraries it can see. */
  detail: z.string().optional(),
  /** Why it did not, in terms the person configuring it can act on. */
  error: z.string().optional(),
});
export type TestMediaServerResponse = z.infer<typeof TestMediaServerResponse>;

/**
 * Exchanges a Jellyfin username and password for a user token.
 *
 * Legacy: nothing in the app calls this any more. Play state only ever needed
 * a user id, and an API key can both list users and write played status - so
 * the settings form picks a user instead of asking for a password. Kept for
 * now against the possibility of a server that genuinely refuses API keys,
 * which has not been observed.
 */
/**
 * Lists the Jellyfin accounts an API key can see, so one can be picked.
 *
 * Replaces signing in. Play state is user-scoped, so this app needs to know
 * *whose* state it is keeping - but a Jellyfin API key is a server-level
 * credential that can already act for any user, so a user id is all that was
 * ever actually required. Confirmed against a real server: the key alone
 * lists users, reads their items, and writes played status.
 */
export const JellyfinListUsersRequest = z.object({
  url: z.string().min(1),
  apiKey: z.string().min(1),
});
export type JellyfinListUsersRequest = z.infer<typeof JellyfinListUsersRequest>;

export const JellyfinUser = z.object({
  id: z.string(),
  name: z.string(),
});
export type JellyfinUser = z.infer<typeof JellyfinUser>;

export const JellyfinListUsersResponse = z.object({
  ok: z.boolean(),
  users: JellyfinUser.array().optional(),
  error: z.string().optional(),
});
export type JellyfinListUsersResponse = z.infer<typeof JellyfinListUsersResponse>;

export const JellyfinSignInRequest = z.object({
  url: z.string().min(1),
  username: z.string().min(1),
  password: z.string(),
});
export type JellyfinSignInRequest = z.infer<typeof JellyfinSignInRequest>;

export const JellyfinSignInResponse = z.object({
  ok: z.boolean(),
  userId: z.string().optional(),
  userToken: z.string().optional(),
  /** Echoed back so the form can show who it signed in as. */
  username: z.string().optional(),
  error: z.string().optional(),
});
export type JellyfinSignInResponse = z.infer<typeof JellyfinSignInResponse>;
