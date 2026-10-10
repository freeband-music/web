import type { Kysely } from "kysely";

const userRef = "users.id";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("playlists")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("owner_id", "text", (c) => c.notNull().references(userRef).onDelete("cascade"))
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("description", "text", (c) => c.notNull().defaultTo(""))
    .addColumn("visibility", "text", (c) => c.notNull())
    .addColumn("created_at", "text", (c) => c.notNull())
    .addColumn("updated_at", "text", (c) => c.notNull())
    .execute();
  await db.schema.createIndex("playlists_owner").on("playlists").column("owner_id").execute();

  await db.schema
    .createTable("playlist_tracks")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("playlist_id", "text", (c) => c.notNull().references("playlists.id").onDelete("cascade"))
    .addColumn("position", "integer", (c) => c.notNull())
    .addColumn("track_id", "text", (c) => c.notNull())
    .addColumn("album_id", "text")
    .addColumn("album_cover", "text")
    .addColumn("duration_ms", "integer")
    .addColumn("snapshot_json", "text", (c) => c.notNull())
    .addColumn("added_at", "text", (c) => c.notNull())
    .addColumn("added_by", "text")
    .execute();
  await db.schema
    .createIndex("playlist_tracks_playlist_position")
    .on("playlist_tracks")
    .columns(["playlist_id", "position"])
    .execute();

  await db.schema
    .createTable("playlist_follows")
    .addColumn("user_id", "text", (c) => c.notNull().references(userRef).onDelete("cascade"))
    .addColumn("playlist_id", "text", (c) => c.notNull().references("playlists.id").onDelete("cascade"))
    .addColumn("created_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("playlist_follows_pk", ["user_id", "playlist_id"])
    .execute();

  for (const [table, key] of [
    ["likes", "track_id"],
    ["saved_albums", "album_id"],
    ["followed_artists", "artist_id"],
  ] as const) {
    await db.schema
      .createTable(table)
      .addColumn("user_id", "text", (c) => c.notNull().references(userRef).onDelete("cascade"))
      .addColumn(key, "text", (c) => c.notNull())
      .addColumn("snapshot_json", "text", (c) => c.notNull())
      .addColumn("created_at", "text", (c) => c.notNull())
      .addPrimaryKeyConstraint(`${table}_pk`, ["user_id", key])
      .execute();
  }

  await db.schema
    .createTable("plays")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("user_id", "text", (c) => c.notNull().references(userRef).onDelete("cascade"))
    .addColumn("track_id", "text", (c) => c.notNull())
    .addColumn("artist_id", "text", (c) => c.notNull())
    .addColumn("artist_name", "text", (c) => c.notNull())
    .addColumn("album_id", "text")
    .addColumn("snapshot_json", "text", (c) => c.notNull())
    .addColumn("played_at", "text", (c) => c.notNull())
    .addColumn("ms_played", "integer", (c) => c.notNull())
    .addColumn("context_type", "text", (c) => c.notNull())
    .addColumn("context_id", "text")
    .addColumn("context_name", "text")
    .addColumn("context_image", "text")
    .execute();
  await db.schema.createIndex("plays_user_played_at").on("plays").columns(["user_id", "played_at"]).execute();

  await db.schema
    .createTable("recent_searches")
    .addColumn("user_id", "text", (c) => c.notNull().references(userRef).onDelete("cascade"))
    .addColumn("kind", "text", (c) => c.notNull())
    .addColumn("key", "text", (c) => c.notNull())
    .addColumn("payload_json", "text", (c) => c.notNull())
    .addColumn("created_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("recent_searches_pk", ["user_id", "kind", "key"])
    .execute();

  await db.schema
    .createTable("user_settings")
    .addColumn("user_id", "text", (c) => c.primaryKey().references(userRef).onDelete("cascade"))
    .addColumn("settings_json", "text", (c) => c.notNull())
    .addColumn("updated_at", "text", (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("playback_state")
    .addColumn("user_id", "text", (c) => c.primaryKey().references(userRef).onDelete("cascade"))
    .addColumn("queue_json", "text", (c) => c.notNull())
    .addColumn("state_json", "text", (c) => c.notNull())
    .addColumn("updated_at", "text", (c) => c.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    "playback_state",
    "user_settings",
    "recent_searches",
    "plays",
    "followed_artists",
    "saved_albums",
    "likes",
    "playlist_follows",
    "playlist_tracks",
    "playlists",
  ]) {
    await db.schema.dropTable(table).execute();
  }
}
