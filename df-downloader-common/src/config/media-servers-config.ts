import { z } from "zod";

/**
 * Translation between the path this app writes to and the path the media
 * server reads from.
 *
 * Almost always needed, and almost always the thing that is wrong when a
 * refresh appears to do nothing. Both sides are usually containers with
 * different mounts for the same directory on the host: this app might write
 * to `/downloads` while Jellyfin sees the identical files at `/media/df`.
 * Telling a server to rescan a path it has never heard of fails silently -
 * the request succeeds, and nothing happens.
 *
 * Left empty when both sides genuinely agree on the path, which is the case
 * for a bare-metal install of both.
 */
export const MediaServerPathMapping = z.object({
  /*
   * Neither side is required to be filled. Half a mapping is a normal
   * intermediate state - you cannot pick the server's folder until you have
   * tested the connection - and refusing to save it, or refusing to test
   * because of it, is how this deadlocked. applyPathMapping treats an
   * incomplete mapping as no mapping.
   */
  from: z.string().describe("The start of the path as this app sees it, e.g. /downloads."),
  to: z.string().describe("What that same directory is called on the media server, e.g. /media/df."),
});
export type MediaServerPathMapping = z.infer<typeof MediaServerPathMapping>;

/*
 * Every field has a default, so a server block that exists but is switched off
 * parses rather than failing.
 *
 * That is the normal state of this form: both blocks render their enable
 * checkbox, so the moment the page is opened it holds a jellyfin object with
 * nothing in it. Requiring a URL there made saving a perfectly good Plex
 * configuration impossible because of a server the user had not touched.
 * What an *enabled* server needs is enforced below, where it can be asked
 * conditionally.
 */
const MediaServerConfigBase = z.object({
  /**
   * Whether this app talks to this server at all.
   *
   * Deliberately just the connection: it used to mean "announce file changes",
   * which quietly made that the price of admission for everything else. Watch
   * state and library scans are separate jobs wanted by different people - a
   * dev box has no interest in telling a server to rescan, but every interest
   * in knowing what has been watched - so each has its own switch below.
   */
  enabled: z.boolean().default(false).describe("Connect to this server."),
  /**
   * Whether a finished download, new metadata or a moved file makes this
   * server rescan. The original purpose of this feature, and on by default
   * for that reason.
   */
  notifyOnChange: z
    .boolean()
    .default(true)
    .describe("Tell this server to rescan when files change, so downloads appear without waiting for its own scan."),
  url: z
    .string()
    .default("")
    .describe("Base URL of the server, e.g. http://192.168.1.10:8096. No trailing path."),
  /*
   * One mapping, not a list. Every path this feature announces - a finished
   * download, metadata written into it, a subtitle beside it, both ends of a
   * move - lives under contentManagement.destinationDir, so a single prefix
   * covers all of them. A list was speculative.
   */
  pathMapping: MediaServerPathMapping.optional().describe(
    "How to translate this app's download folder into the server's. Leave unset only if both see the same paths."
  ),
  /**
   * Whether watching something in this app's own player updates the server.
   *
   * Separate from `enabled` because they are different jobs with different
   * requirements. Announcing a changed folder is a server-level action an API
   * key can perform; play state belongs to a person, so it needs a credential
   * that identifies one. Someone may reasonably want the first and not the
   * second.
   */
  syncPlayState: z
    .boolean()
    .default(false)
    .describe(
      "Keep watched state in step with this server, both ways: playing something here marks it there, and what you watch there is pulled back in."
    ),
});

export const PlexServerKey = "plex";
export const JellyfinServerKey = "jellyfin";

export const PlexMediaServerConfig = MediaServerConfigBase.extend({
  token: z
    .string()
    .default("")
    .describe(
      "An X-Plex-Token. Get one by opening any item in Plex Web, choosing Get Info then View XML, and copying the X-Plex-Token from the resulting URL."
    ),
});
export type PlexMediaServerConfig = z.infer<typeof PlexMediaServerConfig>;

export const JellyfinMediaServerConfig = MediaServerConfigBase.extend({
  apiKey: z
    .string()
    .default("")
    .describe("An API key, created under Dashboard then API Keys in Jellyfin."),
  /*
   * Play state needs to know WHOSE it is, which is a user id - not a login.
   *
   * Jellyfin's play-state endpoints are user-scoped
   * (POST /Users/{userId}/PlayedItems/{itemId}), so an id is required. An API
   * key is a server-level credential that can already act for any user, so the
   * id is the only missing piece and it comes from a picker.
   *
   * This used to claim that recent Jellyfin versions refuse played-status
   * writes made with an API key, and asked for a username and password on that
   * basis. That was never measured and is not true: tested against a real
   * server, the API key alone lists users, reads their items and writes played
   * status. The password flow is gone.
   *
   * userToken is kept only so installs that did sign in keep working - it is
   * used when present, with the API key as the fallback.
   *
   * Plex needs no equivalent: an X-Plex-Token already identifies a user.
   */
  userId: z.string().optional().describe("Set by signing in - not edited by hand."),
  userToken: z.string().optional().describe("Set by signing in - not edited by hand."),
});
export type JellyfinMediaServerConfig = z.infer<typeof JellyfinMediaServerConfig>;

export const MediaServerTypes = [PlexServerKey, JellyfinServerKey] as const;
export type MediaServerType = (typeof MediaServerTypes)[number];

export const MediaServersConfig = z.object({
  servers: z
    .object({
      [PlexServerKey]: PlexMediaServerConfig.optional(),
      [JellyfinServerKey]: JellyfinMediaServerConfig.optional(),
    })
    .optional(),
  /**
   * How long to wait for a file to stop changing before telling anyone about it.
   *
   * A single download is several changes in quick succession - the file lands,
   * metadata is injected into it, a subtitle sidecar appears next to it. Firing
   * a refresh at each one makes the server scan the same directory three times
   * and, worse, can have it read the file mid-rewrite. Waiting for quiet turns
   * that into one refresh after the last change.
   *
   * The cost of a longer wait is only how soon the item appears, so this is
   * deliberately generous rather than tuned.
   */
  settleSeconds: z
    .number()
    .int()
    .min(0)
    .max(600)
    .default(15)
    .describe("Seconds of no further changes to a folder before the server is told. Batches a download, its metadata and its subtitles into one refresh."),
  /**
   * How often to pull watched state back from the servers.
   *
   * Zero turns only the *background* pull off - opening something still checks
   * it, which is the case where staleness is actually visible. Generous by
   * default because watch state is not time-critical: being half an hour
   * behind on "have I seen this" costs nothing, and these are usually the same
   * machine or the same LAN.
   */
  playStateSyncMinutes: z
    .number()
    .int()
    .min(0)
    .max(1440)
    .default(30)
    .describe(
      "How often to pull watched state back from these servers, in minutes. 0 turns the background pull off; anything you open is still checked."
    ),
})
.superRefine((config, ctx) => {
  /*
   * Credentials are required only where the server is actually switched on.
   *
   * Enforced here rather than on the fields so that a disabled block can be
   * blank, while an enabled one still cannot be saved half-finished and then
   * fail silently at the moment a download lands.
   */
  const required = (
    server: { enabled: boolean; url: string } | undefined,
    credential: string | undefined,
    key: string,
    credentialKey: string,
    credentialLabel: string
  ) => {
    if (!server?.enabled) {
      return;
    }
    if (!server.url.trim()) {
      ctx.addIssue({ code: "custom", path: ["servers", key, "url"], message: "Enter the server's address." });
    }
    if (!credential?.trim()) {
      ctx.addIssue({ code: "custom", path: ["servers", key, credentialKey], message: `Enter ${credentialLabel}.` });
    }
  };
  required(config.servers?.[PlexServerKey], config.servers?.[PlexServerKey]?.token, PlexServerKey, "token", "a Plex token");
  required(
    config.servers?.[JellyfinServerKey],
    config.servers?.[JellyfinServerKey]?.apiKey,
    JellyfinServerKey,
    "apiKey",
    "an API key"
  );
});
export type MediaServersConfig = z.infer<typeof MediaServersConfig>;
export const MediaServersConfigKey = "mediaServers";

export const AllMediaServerKeys = [PlexServerKey, JellyfinServerKey];

/**
 * Translates a local path into the server's namespace.
 *
 * Returns the path untouched when there is no mapping, or when it falls
 * outside the mapped folder - translating a path we were not told about would
 * be a guess, and a wrong path fails silently on both servers.
 *
 * Lives here rather than in the service because the settings UI shows the user
 * what their mapping will actually produce, and both sides should demonstrably
 * apply the same rule.
 */
export const applyPathMapping = (localPath: string, mapping?: MediaServerPathMapping | null): string => {
  if (!mapping?.from || !mapping?.to) {
    return localPath;
  }
  const normalise = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const from = normalise(mapping.from);
  const target = normalise(localPath);
  if (target !== from && !target.startsWith(`${from}/`)) {
    return localPath;
  }
  return `${normalise(mapping.to)}${target.slice(from.length)}`;
};
