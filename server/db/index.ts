import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect, type Dialect } from "kysely";
import type { Database } from "./schema";

export type Db = Kysely<Database>;

/**
 * Builds the Kysely dialect for a DATABASE_URL. All dialect-specific code
 * lives here; queries and migrations elsewhere use only portable Kysely.
 * Supported: `sqlite:<path>` and `sqlite::memory:`.
 */
export function createDialect(url: string): Dialect {
  if (url.startsWith("sqlite:")) {
    const path = url.slice("sqlite:".length).replace(/^\/\//, "");
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const sqlite = new SQLite(path);
    sqlite.pragma("foreign_keys = ON");
    if (path !== ":memory:") sqlite.pragma("journal_mode = WAL");
    return new SqliteDialect({ database: sqlite });
  }
  throw new Error(`Unsupported DATABASE_URL (only sqlite: is supported): ${url.split(":")[0]}`);
}

export function createDb(url: string): Db {
  return new Kysely<Database>({ dialect: createDialect(url) });
}
