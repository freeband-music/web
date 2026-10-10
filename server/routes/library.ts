import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  AlbumSnapshot,
  ArtistSnapshot,
  FollowedArtist,
  LibraryResponse,
  LikeLookupResponse,
  LikedTrack,
  RecentSearchesResponse,
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
const searchKind = z.enum(["query", "track", "album", "artist", "playlist"]);
const searchBody = z.object({ kind: searchKind, key: z.string().trim().min(1).max(512), payload: z.unknown().optional() });
const searchQuery = z.object({ kind: searchKind.optional(), key: z.string().min(1).max(512).optional() });
const RECENT_SEARCHES = 10;
const MAX_PAYLOAD = 16 * 1024;

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

  app.get("/library/recent-searches", async (req): Promise<RecentSearchesResponse> => {
    const rows = await db
      .selectFrom("recent_searches")
      .selectAll()
      .where("user_id", "=", currentUser(req).id)
      .orderBy("created_at", "desc")
      .limit(RECENT_SEARCHES)
      .execute();
    return {
      searches: rows.map((r) => ({ kind: r.kind, key: r.key, payload: JSON.parse(r.payload_json), createdAt: r.created_at })),
    };
  });

  app.post("/library/recent-searches", async (req, reply) => {
    const userId = currentUser(req).id;
    const body = parse(searchBody, req.body);
    const payload_json = JSON.stringify(body.payload ?? null);
    if (payload_json.length > MAX_PAYLOAD) throw badRequest("payload is too large");
    const created_at = now().toISOString();
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("recent_searches")
        .values({ user_id: userId, kind: body.kind, key: body.key, payload_json, created_at })
        .onConflict((oc) => oc.columns(["user_id", "kind", "key"]).doUpdateSet({ payload_json, created_at }))
        .execute();
      const old = await trx
        .selectFrom("recent_searches")
        .select(["kind", "key"])
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .offset(RECENT_SEARCHES)
        .limit(1000)
        .execute();
      for (const o of old) {
        await trx
          .deleteFrom("recent_searches")
          .where("user_id", "=", userId)
          .where("kind", "=", o.kind)
          .where("key", "=", o.key)
          .execute();
      }
    });
    return reply.status(204).send();
  });

  app.delete("/library/recent-searches", async (req, reply) => {
    const { kind, key } = parse(searchQuery, req.query);
    let q = db.deleteFrom("recent_searches").where("user_id", "=", currentUser(req).id);
    if (kind) q = q.where("kind", "=", kind);
    if (key) q = q.where("key", "=", key);
    await q.execute();
    return reply.status(204).send();
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
