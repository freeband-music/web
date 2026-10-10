import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("user_addons")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("user_id", "text", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("position", "integer", (c) => c.notNull())
    .addColumn("enabled", "integer", (c) => c.notNull().defaultTo(1))
    .addColumn("url_encrypted", "text", (c) => c.notNull())
    .addColumn("url_hash", "text", (c) => c.notNull())
    .addColumn("base_url", "text", (c) => c.notNull())
    .addColumn("has_config", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("manifest_json", "text", (c) => c.notNull())
    .addColumn("manifest_fetched_at", "text", (c) => c.notNull())
    .addColumn("created_at", "text", (c) => c.notNull())
    .addUniqueConstraint("user_addons_user_url", ["user_id", "url_hash"])
    .execute();

  await db.schema
    .createTable("cache_entries")
    .addColumn("key", "text", (c) => c.primaryKey())
    .addColumn("value_json", "text", (c) => c.notNull())
    .addColumn("status", "text", (c) => c.notNull())
    .addColumn("expires_at", "text", (c) => c.notNull())
    .addColumn("created_at", "text", (c) => c.notNull())
    .execute();
  await db.schema.createIndex("cache_entries_expires_at").on("cache_entries").column("expires_at").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("cache_entries").execute();
  await db.schema.dropTable("user_addons").execute();
}
