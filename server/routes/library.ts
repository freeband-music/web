import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  AlbumSnapshot,
  ArtistSnapshot,
  FollowedArtist,
  LibraryResponse,
  LikeLookupResponse,
  LikedTrack,
  SavedAlbum,
  TrackSnapshot,
} from "../../shared/api";
import { currentUser, requireUser } from "../auth/guard";
import type { Db } from "../db/index";
import { badRequest, parse } from "../http";
import { followedPlaylists, ownPlaylists, summarize } from "../library/playlists";
import { albumSnapshotSchema, artistSnapshotSchema, fromJson, trackSnapshotSchema } from "../library/snapshots";

const itemId = z.string().min(1).max(512);
const idParams = z.object({ id: itemId });
const likeBody = z.object({ track: trackSnapshotSchema });
const albumBody = z.object({ album: albumSnapshotSchema });
const artistBody = z.object({ artist: artistSnapshotSchema });
const lookupBody = z.object({ trackIds: z.array(itemId).max(1000) });

type SavedTable = "likes" | "saved_albums" | "followed_artists";
const keyColumn = { likes: "track_id", saved_albums: "album_id", followed_artists: "artist_id" } as const;

/** Saved items of one kind, newest first. */
async function listSaved<T>(db: Db, table: SavedTable, userId: string) {
  const rows = await db
    .selectFrom(table)
    .select(["snapshot_json", "created_at"])
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();
  return rows.map((r) => ({ item: fromJson<T>(r.snapshot_json), at: r.created_at }));
}

async function save(db: Db, table: SavedTable, userId: string, id: string, snapshot: { id: string }, at: string) {
  if (snapshot.id !== id) throw badRequest("The ID in the body does not match the path");
  const snapshot_json = JSON.stringify(snapshot);
  // The three tables share their shape; only the key column's name differs.
  const values = { user_id: userId, [keyColumn[table]]: id, snapshot_json, created_at: at };
  await db
    .insertInto(table)
    .values(values as never)
    .onConflict((oc) => oc.columns(["user_id", keyColumn[table]] as never).doUpdateSet({ snapshot_json }))
    .execute();
}

async function unsave(db: Db, table: SavedTable, userId: string, id: string) {
  await db
    .deleteFrom(table)
    .where("user_id", "=", userId)
    .where(keyColumn[table] as never, "=", id as never)
    .execute();
}

const likes = (db: Db, userId: string): Promise<LikedTrack[]> =>
  listSaved<TrackSnapshot>(db, "likes", userId).then((r) => r.map(({ item, at }) => ({ track: item, likedAt: at })));
const albums = (db: Db, userId: string): Promise<SavedAlbum[]> =>
  listSaved<AlbumSnapshot>(db, "saved_albums", userId).then((r) => r.map(({ item, at }) => ({ album: item, savedAt: at })));
const artists = (db: Db, userId: string): Promise<FollowedArtist[]> =>
  listSaved<ArtistSnapshot>(db, "followed_artists", userId).then((r) =>
    r.map(({ item, at }) => ({ artist: item, followedAt: at })),
  );

/** Liked songs, saved albums and followed artists. */
export default async function libraryRoutes(app: FastifyInstance): Promise<void> {
  const { db, now } = app.ctx;
  app.addHook("preHandler", requireUser);

  app.get("/library", async (req): Promise<LibraryResponse> => {
    const userId = currentUser(req).id;
    const followed = await followedPlaylists(db, userId);
    const liked = await db
      .selectFrom("likes")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return {
      playlists: await summarize(db, userId, await ownPlaylists(db, userId)),
      followedPlaylists: await summarize(db, userId, followed.rows, followed.followedAt),
      albums: await albums(db, userId),
      artists: await artists(db, userId),
      likedCount: Number(liked?.count ?? 0),
    };
  });

  app.get("/library/likes", async (req) => ({ tracks: await likes(db, currentUser(req).id) }));
  app.get("/library/albums", async (req) => ({ albums: await albums(db, currentUser(req).id) }));
  app.get("/library/artists", async (req) => ({ artists: await artists(db, currentUser(req).id) }));

  app.post("/library/likes/lookup", async (req): Promise<LikeLookupResponse> => {
    const { trackIds } = parse(lookupBody, req.body);
    if (trackIds.length === 0) return { liked: [] };
    const rows = await db
      .selectFrom("likes")
      .select("track_id")
      .where("user_id", "=", currentUser(req).id)
      .where("track_id", "in", trackIds)
      .execute();
    return { liked: rows.map((r) => r.track_id) };
  });

  const routes = [
    ["likes", "likes", (b: unknown) => parse(likeBody, b).track],
    ["albums", "saved_albums", (b: unknown) => parse(albumBody, b).album],
    ["artists", "followed_artists", (b: unknown) => parse(artistBody, b).artist],
  ] as const;
  for (const [path, table, snapshot] of routes) {
    app.put(`/library/${path}/:id`, async (req, reply) => {
      const { id } = parse(idParams, req.params);
      await save(db, table, currentUser(req).id, id, snapshot(req.body), now().toISOString());
      return reply.status(204).send();
    });
    app.delete(`/library/${path}/:id`, async (req, reply) => {
      const { id } = parse(idParams, req.params);
      await unsave(db, table, currentUser(req).id, id);
      return reply.status(204).send();
    });
  }
}
