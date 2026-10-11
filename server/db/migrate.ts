import { Migrator, type Migration, type MigrationResultSet } from "kysely/migration";
import type { Db } from "./index";
import * as m0001 from "./migrations/0001_init";
import * as m0002 from "./migrations/0002_addons";
import * as m0003 from "./migrations/0003_library";
import * as m0004 from "./migrations/0004_play_links";
import * as m0005 from "./migrations/0005_play_artists";

/** Every migration, in order. Add new ones here (static imports keep bundling simple). */
const migrations: Record<string, Migration> = {
  "0001_init": m0001,
  "0002_addons": m0002,
  "0003_library": m0003,
  "0004_play_links": m0004,
  "0005_play_artists": m0005,
};

export function createMigrator(db: Db): Migrator {
  return new Migrator({ db, provider: { getMigrations: async () => migrations } });
}

/** Throws if a migration failed. */
export function checkResult({ error, results }: MigrationResultSet): string[] {
  if (error) throw error instanceof Error ? error : new Error(String(error));
  return (results ?? []).map((r) => `${r.direction} ${r.migrationName}: ${r.status}`);
}

export async function migrateToLatest(db: Db): Promise<string[]> {
  return checkResult(await createMigrator(db).migrateToLatest());
}
