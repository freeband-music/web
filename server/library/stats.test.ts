import { expect, test } from "vitest";
import { createDb } from "../db/index";
import { migrateToLatest } from "../db/migrate";
import { listeningStats } from "./stats";

test("stats count plays, minutes, top tracks and main artists within the range", async () => {
  const db = createDb("sqlite::memory:");
  await migrateToLatest(db);
  await db
    .insertInto("users")
    .values({ id: "u", username: "u", username_lower: "u", display_name: "U", password_hash: "x", created_at: "" })
    .execute();
  const play = (n: number, track: string, artist: string, playedAt: string) => ({
    id: `p${n}`,
    user_id: "u",
    track_id: track,
    artist_id: artist,
    artist_name: artist.toUpperCase(),
    album_id: null,
    snapshot_json: JSON.stringify({ id: track, title: track, artists: [{ id: artist, name: artist }] }),
    played_at: playedAt,
    ms_played: 90_000,
    context_type: "queue" as const,
    context_id: null,
    context_name: null,
    context_image: null,
  });
  await db
    .insertInto("plays")
    .values([
      play(1, "t1", "a", "2026-10-01T00:00:00.000Z"),
      play(2, "t2", "b", "2026-10-02T00:00:00.000Z"),
      play(3, "t2", "b", "2026-10-03T00:00:00.000Z"),
      play(4, "t3", "a", "2026-10-04T00:00:00.000Z"),
      play(5, "t1", "a", "2026-01-01T00:00:00.000Z"),
    ])
    .execute();
  const now = new Date("2026-10-10T00:00:00.000Z");

  const recent = await listeningStats(db, "u", "4w", now);
  expect(recent).toMatchObject({ totalPlays: 4, totalMinutes: 6 });
  expect(recent.topTracks.map((t) => [t.track.id, t.plays])).toEqual([["t2", 2], ["t3", 1], ["t1", 1]]);
  expect(recent.topArtists.map((a) => [a.artist.name, a.plays])).toEqual([["A", 2], ["B", 2]]);

  const all = await listeningStats(db, "u", "all", now);
  expect(all.topTracks[0]).toMatchObject({ track: { id: "t1" }, plays: 2 });
  expect(all.since).toBeNull();
  await db.destroy();
});
