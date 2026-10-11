import type { ArtistSnapshot, StatsRange, StatsResponse, TrackSnapshot } from "../../shared/api";
import type { Db } from "../db/index";
import { fromJson } from "./snapshots";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<Exclude<StatsRange, "all">, number> = { "4w": 28, "6m": 182 };

/** Start of a stats range, or null for all time. */
export function rangeStart(range: StatsRange, now: Date): string | null {
  return range === "all" ? null : new Date(now.getTime() - RANGE_DAYS[range] * DAY_MS).toISOString();
}

/** Totals, top tracks and top artists of a user's plays since `since`. */
export async function listeningStats(
  db: Db,
  userId: string,
  range: StatsRange,
  now: Date,
  limit = 10,
): Promise<StatsResponse> {
  const since = rangeStart(range, now);
  const plays = () => {
    const q = db.selectFrom("plays").where("user_id", "=", userId);
    return since ? q.where("played_at", ">=", since) : q;
  };

  const totals = await plays()
    .select((eb) => [eb.fn.countAll<number>().as("plays"), eb.fn.sum<number>("ms_played").as("ms")])
    .executeTakeFirst();

  const tracks = await plays()
    .select((eb) => ["track_id", eb.fn.countAll<number>().as("plays"), eb.fn.max("played_at").as("last")])
    .groupBy("track_id")
    .orderBy("plays", "desc")
    .orderBy("last", "desc")
    .limit(limit)
    .execute();
  const snapshots = new Map<string, TrackSnapshot>();
  if (tracks.length) {
    const rows = await plays()
      .select(["track_id", "snapshot_json"])
      .where(
        "track_id",
        "in",
        tracks.map((t) => t.track_id),
      )
      .orderBy("played_at", "desc")
      .execute();
    for (const r of rows) if (!snapshots.has(r.track_id)) snapshots.set(r.track_id, fromJson(r.snapshot_json));
  }

  const playArtists = db.selectFrom("play_artists").where("user_id", "=", userId);
  const artists = await (since ? playArtists.where("played_at", ">=", since) : playArtists)
    .select((eb) => [
      "artist_id",
      eb.fn.max("artist_name").as("name"),
      eb.fn.countAll<number>().as("plays"),
      eb.fn.max("played_at").as("last"),
    ])
    .groupBy("artist_id")
    .orderBy("plays", "desc")
    .orderBy("last", "desc")
    .limit(limit)
    .execute();
  // Followed artists carry an image; plays only have names.
  const images = new Map<string, string>();
  if (artists.length) {
    const followed = await db
      .selectFrom("followed_artists")
      .select(["artist_id", "snapshot_json"])
      .where("user_id", "=", userId)
      .where(
        "artist_id",
        "in",
        artists.map((a) => a.artist_id),
      )
      .execute();
    for (const f of followed) {
      const image = fromJson<ArtistSnapshot>(f.snapshot_json).image;
      if (image) images.set(f.artist_id, image);
    }
  }

  return {
    range,
    since,
    totalPlays: Number(totals?.plays ?? 0),
    totalMinutes: Math.round(Number(totals?.ms ?? 0) / 60_000),
    topTracks: tracks.map((t) => ({ track: snapshots.get(t.track_id)!, plays: Number(t.plays) })),
    topArtists: artists.map((a) => ({
      artist: { id: a.artist_id, name: a.name, ...(images.has(a.artist_id) ? { image: images.get(a.artist_id) } : {}) },
      plays: Number(a.plays),
    })),
  };
}
