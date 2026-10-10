import { NO_MIGRATIONS } from "kysely/migration";
import { expect, test } from "vitest";
import { createDb } from "./index";
import { checkResult, createMigrator, migrateToLatest } from "./migrate";

test("migrations run up to latest and back down to nothing", async () => {
  const db = createDb("sqlite::memory:");
  const tables = async () =>
    (await db.introspection.getTables()).map((t) => t.name).filter((n) => !n.startsWith("kysely_")).sort();

  await migrateToLatest(db);
  expect(await tables()).toEqual(["cache_entries", "invites", "server_settings", "sessions", "user_addons", "users"]);

  checkResult(await createMigrator(db).migrateTo(NO_MIGRATIONS));
  expect(await tables()).toEqual([]);
  await db.destroy();
});
