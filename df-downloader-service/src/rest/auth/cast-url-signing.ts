import crypto from "crypto";

/**
 * Signed URLs for cast receivers, and why they exist at all.
 *
 * Everything under /api/playback is behind this app's own cookie auth,
 * which works because a `<video src>` is a plain GET the browser makes
 * with its own cookie attached. A cast receiver breaks that assumption
 * completely: it is a separate device on the network that fetches the
 * stream itself, has no cookie, and has no way to acquire one - so it gets
 * a 401 from every route as they stand.
 *
 * The answer is a narrower credential rather than a hole in the existing
 * one: a URL signed for exactly one file, valid for a bounded window,
 * accepted only on the two routes that serve bytes.
 *
 * Two properties are load-bearing:
 *
 * 1. **The signature proves the URL was not tampered with. It does not
 *    prove the file is legitimate.** Verification happens *after* the
 *    normal DB resolution, never instead of it - the existing lookup still
 *    has to establish that the path is a real download belonging to that
 *    content. A valid signature over a path is not permission to read that
 *    path; it is only evidence that we are the ones who named it.
 *
 * 2. **The key is derived from the installation's existing secret, not a
 *    new one.** signing-secret.ts already manages the one persistent secret
 *    this install has, kept out of config.yaml deliberately (GET /api/config
 *    hands that whole object to the UI). A second secret file would be a
 *    second thing to protect for no gain. It is derived rather than reused
 *    raw so that a signed cast URL can never be confused with, or used to
 *    forge, a login token - different purpose, different key.
 */

const CAST_KEY_PURPOSE = "cast-url";

/**
 * How long a minted URL stays valid.
 *
 * Hours rather than minutes, and that is a deliberate trade rather than
 * laziness: a receiver re-requests byte ranges continuously for as long as
 * playback lasts, so a short expiry does not produce a safer feature, it
 * produces one that dies partway through a 45-minute Direct. Six hours
 * covers a long video plus being paused over dinner.
 *
 * The honest consequence: for that window the URL is a bearer capability
 * for that one file to anything on the LAN that has it. That is why it is
 * minted only when Cast is pressed, is bound to a single download, and is
 * never accepted on anything but the two byte-serving routes.
 */
export const CAST_URL_LIFETIME_MS = 6 * 60 * 60 * 1000;

export type CastUrlSignature = {
  expires: number;
  signature: string;
};

/** Query parameter names, shared by the minting and verifying sides. */
export const CAST_EXPIRES_PARAM = "castExpires";
export const CAST_SIGNATURE_PARAM = "castSig";

const deriveKey = (signingSecret: string) =>
  crypto.createHmac("sha256", signingSecret).update(CAST_KEY_PURPOSE).digest();

/**
 * Binds the content, the resolved file and the expiry together.
 *
 * The download location signed here is always the one the DB holds, never
 * the one the caller asked for - so a request that resolves to a different
 * file than the URL was minted for cannot verify.
 */
const payloadFor = (contentKey: string, downloadLocation: string, expires: number) =>
  `${contentKey}\n${downloadLocation}\n${expires}`;

export const signCastUrl = (
  signingSecret: string,
  contentKey: string,
  downloadLocation: string,
  expires: number
): CastUrlSignature => ({
  expires,
  signature: crypto
    .createHmac("sha256", deriveKey(signingSecret))
    .update(payloadFor(contentKey, downloadLocation, expires))
    .digest("base64url"),
});

/**
 * Whether this request carries a signature we issued for this exact file.
 *
 * Compared in constant time. A plain `===` on a secret leaks how much of a
 * guess was correct through how long the comparison took, which is exactly
 * the thing that makes a signature guessable given enough attempts.
 */
export const verifyCastUrl = (
  signingSecret: string,
  contentKey: string,
  downloadLocation: string,
  expires: unknown,
  signature: unknown
): boolean => {
  if (typeof signature !== "string" || typeof expires !== "string") {
    return false;
  }
  const expiresAt = Number.parseInt(expires, 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }
  const expected = signCastUrl(signingSecret, contentKey, downloadLocation, expiresAt).signature;
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  // timingSafeEqual throws rather than returning false on a length mismatch,
  // and a wrong-length signature is a normal thing for an attacker to send.
  if (given.length !== wanted.length) {
    return false;
  }
  return crypto.timingSafeEqual(given, wanted);
};
