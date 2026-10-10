import type { PlaylistEntry, PlaylistSummary, TrackSnapshot } from "../../shared/api";
import type { Db } from "../db/index";
import type { Playlist, PlaylistTrack } from "../db/schema";
import { fromJson } from "./snapshots";

export type PlaylistRow = Playlist & { username: string; display_name: string };

const MOSAIC = 4;

/** Playlists with their owner's names; `where` narrows the query. */
export function playlistQuery(db: Db) {
  return db
    .selectFrom("playlists")
    .innerJoin("users", "users.id", "playlists.owner_id")
    .selectAll("playlists")
    .select(["users.username", "users.display_name"]);
}

export async function findPlaylist(db: Db, id: string): Promise<PlaylistRow | undefined> {
  return playlistQuery(db).where("playlists.id", "=", id).executeTakeFirst();
}

export function canView(row: PlaylistRow, userId: string): boolean {
  return row.owner_id === userId || row.visibility === "public";
}

/** The first `n` distinct non-empty covers, in order. */
export function mosaicCovers(covers: (string | null)[], n = MOSAIC): string[] {
  return [...new Set(covers.filter((c): c is string => !!c))].slice(0, n);
}

/** Summaries for `rows`, in the same order, with counts, durations and mosaic covers. */
export async function summarize(
  db: Db,
  userId: string,
  rows: PlaylistRow[],
  followedAt: Map<string, string> = new Map(),
): Promise<PlaylistSummary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const totals = await db
    .selectFrom("playlist_tracks")
    .select((eb) => ["playlist_id", eb.fn.countAll<number>().as("count"), eb.fn.sum<number>("duration_ms").as("duration")])
    .where("playlist_id", "in", ids)
    .groupBy("playlist_id")
    .execute();
  const covers = await db
    .selectFrom("playlist_tracks")
    .select(["playlist_id", "album_cover"])
    .where("playlist_id", "in", ids)
    .where("album_cover", "is not", null)
    .orderBy("playlist_id")
    .orderBy("position")
    .execute();
  const byId = new Map(totals.map((t) => [t.playlist_id, t]));
  const coversById = new Map<string, (string | null)[]>();
  for (const c of covers) coversById.set(c.playlist_id, [...(coversById.get(c.playlist_id) ?? []), c.album_cover]);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    visibility: r.visibility,
    owner: { username: r.username, displayName: r.display_name },
    isOwner: r.owner_id === userId,
    followed: followedAt.has(r.id),
    trackCount: Number(byId.get(r.id)?.count ?? 0),
    durationMs: Number(byId.get(r.id)?.duration ?? 0),
    covers: mosaicCovers(coversById.get(r.id) ?? []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(followedAt.has(r.id) ? { followedAt: followedAt.get(r.id) } : {}),
  }));
}

/** The user's follows of playlists they can still see, newest first. */
export async function followedPlaylists(db: Db, userId: string): Promise<{ rows: PlaylistRow[]; followedAt: Map<string, string> }> {
  const rows = await playlistQuery(db)
    .innerJoin("playlist_follows", "playlist_follows.playlist_id", "playlists.id")
    .select("playlist_follows.created_at as followed_at")
    .where("playlist_follows.user_id", "=", userId)
    .where("playlists.visibility", "=", "public")
    .where("playlists.owner_id", "!=", userId)
    .orderBy("playlist_follows.created_at", "desc")
    .execute();
  return { rows, followedAt: new Map(rows.map((r) => [r.id, r.followed_at])) };
}

export async function ownPlaylists(db: Db, userId: string): Promise<PlaylistRow[]> {
  return playlistQuery(db).where("playlists.owner_id", "=", userId).orderBy("playlists.updated_at", "desc").execute();
}

export async function playlistEntries(db: Db, playlistId: string): Promise<PlaylistTrack[]> {
  return db.selectFrom("playlist_tracks").selectAll().where("playlist_id", "=", playlistId).orderBy("position").execute();
}

export function toEntry(row: PlaylistTrack): PlaylistEntry {
  return { entryId: row.id, track: fromJson<TrackSnapshot>(row.snapshot_json), addedAt: row.added_at };
}

/** The row columns kept beside a track snapshot. */
export function trackColumns(track: TrackSnapshot) {
  return {
    track_id: track.id,
    album_id: track.album?.id ?? null,
    album_cover: track.album?.cover ?? null,
    duration_ms: track.durationMs ?? null,
    snapshot_json: JSON.stringify(track),
  };
}
