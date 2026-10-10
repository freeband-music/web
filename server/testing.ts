import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app";
import { DEFAULT_PREFETCH, DEFAULT_TTLS, type Config } from "./config";
import { createDb } from "./db/index";
import { migrateToLatest } from "./db/migrate";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    host: "127.0.0.1",
    databaseUrl: "sqlite::memory:",
    secretKey: randomBytes(32),
    signup: "open",
    cookieSecure: false,
    trustProxy: false,
    staticDir: "does-not-exist",
    production: false,
    ttl: DEFAULT_TTLS,
    prefetch: DEFAULT_PREFETCH,
    ...overrides,
  };
}

/** An app on a fresh, migrated in-memory database. */
export async function testApp(overrides: Partial<Config> = {}): Promise<FastifyInstance> {
  const config = testConfig(overrides);
  const db = createDb(config.databaseUrl);
  await migrateToLatest(db);
  const app = await buildApp(config, { db });
  app.addHook("onClose", () => db.destroy());
  return app;
}

/** The `fb_session` cookie from a response, as a request `cookie` header. */
export function sessionCookie(res: { cookies: { name: string; value: string }[] }): string {
  const c = res.cookies.find((x) => x.name === "fb_session");
  if (!c) throw new Error("no session cookie");
  return `fb_session=${c.value}`;
}
