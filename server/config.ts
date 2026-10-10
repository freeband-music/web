import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const SIGNUP_MODES = ["open", "invite", "closed"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  secretKey: Buffer;
  /** Default sign-up mode; an admin setting stored in the database overrides it. */
  signup: SignupMode;
  /** `auto` marks the cookie secure when the request arrived over https. */
  cookieSecure: boolean | "auto";
  trustProxy: boolean;
  /** Directory of the built client; served with an SPA fallback when it exists. */
  staticDir: string;
  production: boolean;
  /** Cache lifetimes in seconds. */
  ttl: CacheTtls;
  prefetch: PrefetchConfig;
  /**
   * Whether stream add-ons may be asked to start a download when nothing is
   * playable yet. Users must also turn it on; see `downloadsPermitted`.
   */
  allowDownloads: boolean;
}

export interface CacheTtls {
  meta: number;
  search: number;
  manifest: number;
  stream: number;
  notFound: number;
}

export interface PrefetchConfig {
  /** Stream lookups running at once per user. */
  concurrency: number;
  /** Most tracks one prefetch request covers. */
  limit: number;
  /** Only this many tracks after the current one may make a stream add-on queue a download. */
  queueAhead: number;
}

export const DEFAULT_TTLS: CacheTtls = {
  meta: 7 * 86400,
  search: 86400,
  manifest: 3600,
  stream: 6 * 3600,
  notFound: 3600,
};

export const DEFAULT_PREFETCH: PrefetchConfig = { concurrency: 2, limit: 50, queueAhead: 3 };

type Env = Record<string, string | undefined>;

const DEV_KEY_FILE = ".dev/secret.key";

/** Parses a 32-byte key given as base64 or hex. */
export function parseSecretKey(value: string): Buffer {
  const text = value.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(text)
    ? Buffer.from(text, "hex")
    : Buffer.from(text, "base64");
  if (key.length !== 32) {
    throw new Error("FREEBAND_SECRET_KEY must be 32 bytes, base64 or hex encoded");
  }
  return key;
}

function boolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** Parses a duration such as `90`, `90s`, `15m`, `6h` or `7d` into seconds. */
export function parseDuration(value: string, name: string): number {
  const match = /^(\d+)\s*([smhd]?)$/i.exec(value.trim());
  if (!match) throw new Error(`${name} must be a duration such as 3600, 15m, 6h or 7d`);
  return Number(match[1]) * UNITS[(match[2] || "s").toLowerCase()];
}

function durationEnv(env: Env, name: string, fallback: number): number {
  const value = env[name];
  return value === undefined || value === "" ? fallback : parseDuration(value, name);
}

function intEnv(env: Env, name: string, fallback: number, min: number): number {
  const value = env[name];
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be an integer of at least ${min}`);
  return n;
}

function loadSecretKey(env: Env, production: boolean, warn: (msg: string) => void): Buffer {
  if (env.FREEBAND_SECRET_KEY) return parseSecretKey(env.FREEBAND_SECRET_KEY);
  if (production) throw new Error("FREEBAND_SECRET_KEY is required when NODE_ENV=production");
  if (existsSync(DEV_KEY_FILE)) return parseSecretKey(readFileSync(DEV_KEY_FILE, "utf8"));
  const key = randomBytes(32);
  mkdirSync(dirname(DEV_KEY_FILE), { recursive: true });
  writeFileSync(DEV_KEY_FILE, key.toString("base64") + "\n", { mode: 0o600 });
  warn(`FREEBAND_SECRET_KEY is not set; generated a development key in ${DEV_KEY_FILE}`);
  return key;
}

export function loadConfig(env: Env = process.env, warn: (msg: string) => void = console.warn): Config {
  const production = env.NODE_ENV === "production";
  const signup = (env.FREEBAND_SIGNUP ?? "open") as SignupMode;
  if (!SIGNUP_MODES.includes(signup)) {
    throw new Error(`FREEBAND_SIGNUP must be one of ${SIGNUP_MODES.join(", ")}`);
  }
  const port = Number(env.FREEBAND_PORT ?? 7010);
  if (!Number.isInteger(port) || port <= 0) throw new Error("FREEBAND_PORT must be a port number");
  const secure = env.FREEBAND_COOKIE_SECURE;
  return {
    port,
    host: env.FREEBAND_HOST ?? "0.0.0.0",
    databaseUrl: env.DATABASE_URL ?? "sqlite:.dev/freeband.db",
    secretKey: loadSecretKey(env, production, warn),
    signup,
    cookieSecure: secure === undefined || secure === "" || secure === "auto" ? "auto" : boolEnv(secure, false),
    trustProxy: boolEnv(env.FREEBAND_TRUST_PROXY, false),
    staticDir: env.FREEBAND_STATIC_DIR ?? "dist",
    production,
    ttl: {
      meta: durationEnv(env, "FREEBAND_TTL_META", DEFAULT_TTLS.meta),
      search: durationEnv(env, "FREEBAND_TTL_SEARCH", DEFAULT_TTLS.search),
      manifest: durationEnv(env, "FREEBAND_TTL_MANIFEST", DEFAULT_TTLS.manifest),
      stream: durationEnv(env, "FREEBAND_TTL_STREAM", DEFAULT_TTLS.stream),
      notFound: durationEnv(env, "FREEBAND_TTL_NOT_FOUND", DEFAULT_TTLS.notFound),
    },
    prefetch: {
      concurrency: intEnv(env, "FREEBAND_PREFETCH_CONCURRENCY", DEFAULT_PREFETCH.concurrency, 1),
      limit: intEnv(env, "FREEBAND_PREFETCH_LIMIT", DEFAULT_PREFETCH.limit, 0),
      queueAhead: intEnv(env, "FREEBAND_PREFETCH_QUEUE_AHEAD", DEFAULT_PREFETCH.queueAhead, 0),
    },
    allowDownloads: boolEnv(env.FREEBAND_ALLOW_DOWNLOADS, false),
  };
}
