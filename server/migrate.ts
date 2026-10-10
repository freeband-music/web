import { loadConfig } from "./config";
import { createDb } from "./db/index";
import { checkResult, createMigrator } from "./db/migrate";

const command = process.argv[2] ?? "latest";
const config = loadConfig();
const db = createDb(config.databaseUrl);
const migrator = createMigrator(db);

try {
  const result =
    command === "up"
      ? await migrator.migrateUp()
      : command === "down"
        ? await migrator.migrateDown()
        : command === "latest"
          ? await migrator.migrateToLatest()
          : null;
  if (!result) throw new Error(`Unknown command "${command}"; use up, down or latest`);
  const lines = checkResult(result);
  console.log(lines.length ? lines.join("\n") : "Nothing to do");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
