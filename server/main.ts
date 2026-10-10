import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db/index";
import { migrateToLatest } from "./db/migrate";

const config = loadConfig();
const db = createDb(config.databaseUrl);
for (const line of await migrateToLatest(db)) console.log(`migration ${line}`);

const app = await buildApp(config, { db }, { logger: true });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    await db.destroy();
    process.exit(0);
  });
}
await app.listen({ port: config.port, host: config.host });
