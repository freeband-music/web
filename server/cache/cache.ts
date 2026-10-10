import type { Db } from "../db/index";

export type CacheStatus = "ok" | "not_found" | "error";

export interface CacheEntry<T = unknown> {
  value: T;
  status: CacheStatus;
  expiresAt: string;
}

/** Where cache entries are kept; the database in the app, a map in tests. */
export interface CacheStore {
  get(key: string): Promise<{ valueJson: string; status: CacheStatus; expiresAt: string } | undefined>;
  set(key: string, valueJson: string, status: CacheStatus, expiresAt: string, createdAt: string): Promise<void>;
  /** Deletes entries that expired before `nowIso`; returns how many. */
  purge(nowIso: string): Promise<number>;
  clear(): Promise<void>;
}

/**
 * Which add-on an entry belongs to. Add-ons without a config segment share
 * entries across users (keyed by the base URL); add-ons with one are keyed by
 * the hash of their full URL, so only that install sees them.
 */
export interface AddonScope {
  hasConfig: boolean;
  baseUrl: string;
  urlHash: string;
}

export function scopeKey(scope: AddonScope): string {
  return scope.hasConfig ? `private:${scope.urlHash}` : `shared:${scope.baseUrl}`;
}

/** `resource|scope|params`, with params in a stable order. */
export function cacheKey(resource: string, scope: AddonScope, params: Record<string, string | number | undefined>): string {
  const query = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join("&");
  return `${resource}|${scopeKey(scope)}|${query}`;
}

/**
 * Lifetime of a response: the configured TTL, shortened by the add-on's
 * `Cache-Control: max-age` when that is lower. `no-store` and `no-cache`
 * mean "do not cache" (0).
 */
export function effectiveTtl(configured: number, cacheControl: string | null | undefined): number {
  if (!cacheControl) return configured;
  const header = cacheControl.toLowerCase();
  if (/(^|[\s,])(no-store|no-cache|private)([\s,=]|$)/.test(header)) return 0;
  const match = /(?:^|[\s,])max-age\s*=\s*"?(\d+)/.exec(header);
  return match ? Math.min(configured, Number(match[1])) : configured;
}

export class Cache {
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: CacheStore,
    private readonly now: () => Date,
  ) {}

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const row = await this.store.get(key);
    if (!row || row.expiresAt <= this.now().toISOString()) return undefined;
    return { value: JSON.parse(row.valueJson) as T, status: row.status, expiresAt: row.expiresAt };
  }

  /** Stores a value for `ttlSeconds`; a TTL of 0 or less stores nothing. */
  async set(key: string, value: unknown, status: CacheStatus, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    const now = this.now();
    const expires = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    await this.store.set(key, JSON.stringify(value), status, expires, now.toISOString());
  }

  /** Runs `load` once per key at a time; concurrent callers share the same promise. */
  dedupe<T>(key: string, load: () => Promise<T>): Promise<T> {
    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;
    const promise = load().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  purge(): Promise<number> {
    return this.store.purge(this.now().toISOString());
  }

  clear(): Promise<void> {
    return this.store.clear();
  }
}

export class DbCacheStore implements CacheStore {
  constructor(private readonly db: Db) {}

  async get(key: string) {
    const row = await this.db
      .selectFrom("cache_entries")
      .select(["value_json", "status", "expires_at"])
      .where("key", "=", key)
      .executeTakeFirst();
    return row && { valueJson: row.value_json, status: row.status, expiresAt: row.expires_at };
  }

  async set(key: string, valueJson: string, status: CacheStatus, expiresAt: string, createdAt: string) {
    await this.db
      .insertInto("cache_entries")
      .values({ key, value_json: valueJson, status, expires_at: expiresAt, created_at: createdAt })
      .onConflict((oc) => oc.column("key").doUpdateSet({ value_json: valueJson, status, expires_at: expiresAt, created_at: createdAt }))
      .execute();
  }

  async purge(nowIso: string) {
    const result = await this.db.deleteFrom("cache_entries").where("expires_at", "<=", nowIso).executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  async clear() {
    await this.db.deleteFrom("cache_entries").execute();
  }
}

export class MemoryCacheStore implements CacheStore {
  readonly rows = new Map<string, { valueJson: string; status: CacheStatus; expiresAt: string }>();

  async get(key: string) {
    return this.rows.get(key);
  }

  async set(key: string, valueJson: string, status: CacheStatus, expiresAt: string) {
    this.rows.set(key, { valueJson, status, expiresAt });
  }

  async purge(nowIso: string) {
    let n = 0;
    for (const [key, row] of this.rows) {
      if (row.expiresAt <= nowIso) {
        this.rows.delete(key);
        n++;
      }
    }
    return n;
  }

  async clear() {
    this.rows.clear();
  }
}
