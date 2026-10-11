import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("play_links")
    .addColumn("token_hash", "text", (c) => c.primaryKey())
    .addColumn("stream_key", "text", (c) => c.notNull())
    .addColumn("user_id", "text", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("addon_id", "text", (c) => c.notNull().references("user_addons.id").onDelete("cascade"))
    .addColumn("token_encrypted", "text", (c) => c.notNull())
    .addColumn("url_encrypted", "text", (c) => c.notNull())
    .addColumn("expires_at", "text", (c) => c.notNull())
    .addColumn("created_at", "text", (c) => c.notNull())
    .execute();
  await db.schema.createIndex("play_links_stream_key").on("play_links").column("stream_key").execute();
  await db.schema.createIndex("play_links_expires_at").on("play_links").column("expires_at").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("play_links").execute();
}
