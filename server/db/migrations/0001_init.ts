import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("users")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("username", "text", (c) => c.notNull())
    .addColumn("username_lower", "text", (c) => c.notNull().unique())
    .addColumn("display_name", "text", (c) => c.notNull())
    .addColumn("password_hash", "text", (c) => c.notNull())
    .addColumn("is_admin", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("created_at", "text", (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("sessions")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("user_id", "text", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("created_at", "text", (c) => c.notNull())
    .addColumn("last_seen_at", "text", (c) => c.notNull())
    .addColumn("expires_at", "text", (c) => c.notNull())
    .addColumn("user_agent", "text")
    .execute();
  await db.schema.createIndex("sessions_user_id").on("sessions").column("user_id").execute();

  await db.schema
    .createTable("invites")
    .addColumn("code", "text", (c) => c.primaryKey())
    .addColumn("created_by", "text", (c) => c.references("users.id").onDelete("set null"))
    .addColumn("created_at", "text", (c) => c.notNull())
    .addColumn("used_by", "text", (c) => c.references("users.id").onDelete("set null"))
    .addColumn("used_at", "text")
    .execute();

  await db.schema
    .createTable("server_settings")
    .addColumn("key", "text", (c) => c.primaryKey())
    .addColumn("value", "text", (c) => c.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("server_settings").execute();
  await db.schema.dropTable("invites").execute();
  await db.schema.dropTable("sessions").execute();
  await db.schema.dropTable("users").execute();
}
