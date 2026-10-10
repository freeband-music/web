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
}

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
  const port = Number(env.FREEBAND_PORT ?? 7000);
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
  };
}
