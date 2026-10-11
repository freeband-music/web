import { decrypt, encrypt, randomToken, sha256Hex } from "../crypto";
import type { Db } from "../db/index";

/** How long a play link lasts, as long as a cached stream answer. */
export const LINK_TTL_S = 6 * 3600;
/** A link is handed out again only while it has at least this long left. */
const REUSE_MIN_LEFT_S = 3600;
/** How long the media URL an add-on redirected to is remembered. */
const MEDIA_TTL_MS = 30 * 60 * 1000;
const MEDIA_MAX = 5000;

export const PLAY_PATH = "/api/play/";

/** What a play link points at. */
export interface PlayTarget {
  tokenHash: string;
  addonId: string;
  /** The add-on's play URL. Never log or return it. */
  url: string;
}

/**
 * Play links: `/api/play/<token>` stands for one add-on play URL of one user.
 * The same link is reused for the same stream while it has time left, so a
 * replay or a seek asks for the same URL.
 */
export class PlayLinks {
  /** Media URLs add-ons redirected to, by token hash; memory only, never stored. */
  private readonly media = new Map<string, { url: string; until: number }>();

  constructor(
    private readonly db: Db,
    private readonly key: Buffer,
    private readonly now: () => Date,
  ) {}

  /** The play link (a path) for an add-on play URL. */
  async issue(userId: string, addonId: string, url: string): Promise<string> {
    const streamKey = sha256Hex(`${userId}\n${addonId}\n${url}`);
    const now = this.now();
    const reusable = await this.db
      .selectFrom("play_links")
      .select("token_encrypted")
      .where("stream_key", "=", streamKey)
      .where("expires_at", ">", new Date(now.getTime() + REUSE_MIN_LEFT_S * 1000).toISOString())
      .orderBy("expires_at", "desc")
      .executeTakeFirst();
    if (reusable) return PLAY_PATH + decrypt(reusable.token_encrypted, this.key);
    const token = randomToken();
    await this.db
      .insertInto("play_links")
      .values({
        token_hash: sha256Hex(token),
        stream_key: streamKey,
        user_id: userId,
        addon_id: addonId,
        token_encrypted: encrypt(token, this.key),
        url_encrypted: encrypt(url, this.key),
        expires_at: new Date(now.getTime() + LINK_TTL_S * 1000).toISOString(),
        created_at: now.toISOString(),
      })
      .execute();
    return PLAY_PATH + token;
  }

  /** The target of a token, if it exists, has not expired and belongs to the user. */
  async resolve(userId: string, token: string): Promise<PlayTarget | undefined> {
    const tokenHash = sha256Hex(token);
    const row = await this.db
      .selectFrom("play_links")
      .select(["addon_id", "url_encrypted", "user_id", "expires_at"])
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();
    if (!row || row.user_id !== userId || row.expires_at <= this.now().toISOString()) return undefined;
    return { tokenHash, addonId: row.addon_id, url: decrypt(row.url_encrypted, this.key) };
  }

  /** The media URL remembered for a link, if any. */
  mediaUrl(tokenHash: string): string | undefined {
    const hit = this.media.get(tokenHash);
    if (hit && hit.until > Date.now()) return hit.url;
    this.media.delete(tokenHash);
    return undefined;
  }

  rememberMedia(tokenHash: string, url: string): void {
    if (this.media.size >= MEDIA_MAX) this.pruneMedia();
    if (this.media.size >= MEDIA_MAX) this.media.clear();
    this.media.set(tokenHash, { url, until: Date.now() + MEDIA_TTL_MS });
  }

  forgetMedia(tokenHash: string): void {
    this.media.delete(tokenHash);
  }

  /** Deletes expired links; run with the cache purge. */
  async purge(): Promise<number> {
    this.pruneMedia();
    const result = await this.db.deleteFrom("play_links").where("expires_at", "<=", this.now().toISOString()).executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  private pruneMedia(): void {
    const now = Date.now();
    for (const [key, entry] of this.media) if (entry.until <= now) this.media.delete(key);
  }
}
