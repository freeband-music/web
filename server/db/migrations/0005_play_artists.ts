import type { Kysely } from "kysely";

const BATCH = 500;

/** Every artist of each play, so top artists count featured artists too. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("play_artists")
    .addColumn("play_id", "text", (c) => c.notNull().references("plays.id").onDelete("cascade"))
    .addColumn("user_id", "text", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("artist_id", "text", (c) => c.notNull())
    .addColumn("artist_name", "text", (c) => c.notNull())
    .addColumn("played_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("play_artists_pk", ["play_id", "artist_id"])
    .execute();
  await db.schema.createIndex("play_artists_user_played").on("play_artists").columns(["user_id", "played_at"]).execute();

  for (let offset = 0; ; offset += BATCH) {
    const plays = await db
      .selectFrom("plays")
      .select(["id", "user_id", "artist_id", "artist_name", "snapshot_json", "played_at"])
      .orderBy("id")
      .limit(BATCH)
      .offset(offset)
      .execute();
    if (plays.length === 0) break;
    const rows = plays.flatMap((p) => {
      let artists: { id?: unknown; name?: unknown }[] = [];
      try {
        artists = JSON.parse(p.snapshot_json).artists ?? [];
      } catch {
        // Fall back to the main artist below.
      }
      const named = artists.filter((a) => typeof a.id === "string" && typeof a.name === "string");
      const list = named.length ? named : [{ id: p.artist_id, name: p.artist_name }];
      const seen = new Set<string>();
      return list
        .filter((a) => !seen.has(a.id as string) && seen.add(a.id as string))
        .map((a) => ({ play_id: p.id, user_id: p.user_id, artist_id: a.id, artist_name: a.name, played_at: p.played_at }));
    });
    await db.insertInto("play_artists").values(rows).execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("play_artists").execute();
}
