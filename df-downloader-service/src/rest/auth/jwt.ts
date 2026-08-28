import { ExpiryCache } from "df-downloader-common";
import { configDir } from "../../config/config.js";
import { loadOrCreateSigningSecret } from "./signing-secret.js";
import jwt from "jsonwebtoken";

export class JwtManager {
  readonly blockList: ExpiryCache<jwt.JwtPayload | null> = new ExpiryCache();
  blocklistCleanupTimer: NodeJS.Timeout | null = null;
  static async create(tokenLifetime: number) {
    // Persisted, not minted per-process: a fresh secret on every start
    // invalidated every issued token, so a restart silently signed everyone
    // out. See signing-secret.ts for where it's kept and how to rotate it.
    const signingSecret = await loadOrCreateSigningSecret(configDir);
    return new JwtManager(tokenLifetime, signingSecret);
  }
  tokenLifetime: number;
  signingSecret: string;
  private constructor(tokenLifetime: number, initialSigningSecret: string) {
    this.tokenLifetime = tokenLifetime;
    this.signingSecret = initialSigningSecret;
  }
  generateJwt<T extends string | object | Buffer>(data: T) {
    return jwt.sign(data, this.signingSecret, {
      expiresIn: this.tokenLifetime,
    });
  }
  verifyJwt<T extends string | object | Buffer>(token: string) {
    // Presence, not truthiness: ExpiryCache.has() is Boolean(get(key)), and a
    // token we couldn't decode is stored with a null value, which would read
    // as "not blocklisted".
    if (this.blockList.getEntry(token) !== undefined) {
      throw new Error("Token is in blocklist");
    }
    return jwt.verify(token, this.signingSecret) as T;
  }
  invalidateToken(token: string) {
    const now = Date.now();
    let expiry = now + this.tokenLifetime * 1000;
    let parsed: jwt.JwtPayload | null = null;
    try {
      parsed = jwt.decode(token, { json: true }) || null;
      // decode({json:true}) returns the payload itself, so exp is on it
      // directly - the old `parsed.payload.exp` threw every time and left the
      // expiry at the fallback below.
      if (parsed?.exp) {
        expiry = parsed.exp * 1000;
      }
    } catch (e) {}
    this.blockList.setExpireAt(token, parsed, expiry);
  }
}
