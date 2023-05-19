import { ExpiryCache } from "df-downloader-common";
import { generateSecretAsync } from "./utils.js";
import jwt from "jsonwebtoken";

export class JwtManager {
  readonly blockList: ExpiryCache<jwt.JwtPayload | null> = new ExpiryCache();
  blocklistCleanupTimer: NodeJS.Timeout | null = null;
  static async create(tokenLifetime: number) {
    const signingSecret = await generateSecretAsync(32);
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
    if (this.blockList.has(token)) {
      throw new Error("Token is in blocklist");
    }
    return jwt.verify(token, this.signingSecret) as T;
  }
  invalidateToken(token: string) {
    const now = Date.now();
    let expiry = now + this.tokenLifetime * 1000;
    let parsed: jwt.JwtPayload | null = null;
    try {
      const parsed = jwt.decode(token, { json: true }) || null;
      if (parsed) {
        expiry = (parsed.payload.exp || now) * 1000;
      }
    } catch (e) {}
    this.blockList.setExpireAt(token, parsed, expiry);
  }
}
