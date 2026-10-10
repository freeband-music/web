import { Migrator, type Migration, type MigrationResultSet } from "kysely/migration";
import type { Db } from "./index";
import * as m0001 from "./migrations/0001_init";

/** Every migration, in order. Add new ones here (static imports keep bundling simple). */
const migrations: Record<string, Migration> = {
  "0001_init": m0001,
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
