import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PlaylistResponse, PlaylistsResponse } from "../../shared/api";
import { loadActiveAddons } from "../addons/store";
import { currentUser, requireUser } from "../auth/guard";
import type { User } from "../db/schema";
import { badRequest, forbidden, notFound, parse } from "../http";
import { changedPositions, insertAt, moveEntries } from "../library/order";
import {
  canView,
  findPlaylist,
  followedPlaylists,
  ownPlaylists,
  playlistEntries,
  summarize,
  toEntry,
  trackColumns,
  type PlaylistRow,
} from "../library/playlists";
import { trackSnapshotSchema } from "../library/snapshots";

export const MAX_PLAYLIST_TRACKS = 10_000;
const MAX_ADD = 1000;

const visibility = z.enum(["private", "public"]);
const name = z.string().trim().min(1).max(200);
const description = z.string().trim().max(2000);
const entryIds = z.array(z.string().min(1).max(64)).min(1).max(MAX_PLAYLIST_TRACKS);
const idParams = z.object({ id: z.string().min(1).max(64) });
const createBody = z.object({
  name,
  description: description.optional(),
  visibility: visibility.optional(),
  tracks: z.array(trackSnapshotSchema).max(MAX_ADD).optional(),
});
const updateBody = z.object({ name: name.optional(), description: description.optional(), visibility: visibility.optional() });
const addBody = z.object({ tracks: z.array(trackSnapshotSchema).min(1).max(MAX_ADD), position: z.number().int().min(0).optional() });
const removeBody = z.object({ entryIds });
const moveBody = z.object({ entryIds, beforeEntryId: z.string().min(1).max(64).nullable() });

export default async function playlistRoutes(app: FastifyInstance): Promise<void> {
  const { db, now, config, addons: service, prefetch } = app.ctx;
  app.addHook("preHandler", requireUser);

  /** The playlist if the user may see it; 404 otherwise. */
  const visible = async (req: FastifyRequest): Promise<{ user: User; row: PlaylistRow }> => {
    const user = currentUser(req);
    const row = await findPlaylist(db, parse(idParams, req.params).id);
    if (!row || !canView(row, user.id)) throw notFound("No such playlist");
    return { user, row };
  };

  /** The playlist if the user owns it; 403 for others' public playlists, 404 otherwise. */
  const owned = async (req: FastifyRequest) => {
    const found = await visible(req);
    if (found.row.owner_id !== found.user.id) throw forbidden("Only the owner can change this playlist");
    return found;
  };

  const detail = async (userId: string, playlistId: string): Promise<PlaylistResponse> => {
    const row = await findPlaylist(db, playlistId);
    if (!row) throw notFound("No such playlist");
    const follow = await db
      .selectFrom("playlist_follows")
      .select("created_at")
      .where("user_id", "=", userId)
      .where("playlist_id", "=", playlistId)
      .executeTakeFirst();
    const followedAt = new Map(follow ? [[playlistId, follow.created_at]] : []);
    const [playlist] = await summarize(db, userId, [row], followedAt);
    return { playlist, tracks: (await playlistEntries(db, playlistId)).map(toEntry) };
  };

  /** Rewrites the positions that changed between two orders. */
  const writeOrder = async (trx: typeof db, previous: string[], next: string[]) => {
    const existing = new Set(previous);
    for (const { id, position } of changedPositions(previous, next)) {
      if (!existing.has(id)) continue;
      await trx.updateTable("playlist_tracks").set({ position }).where("id", "=", id).execute();
    }
  };

  const currentOrder = async (trx: typeof db, playlistId: string) =>
    (
      await trx.selectFrom("playlist_tracks").select("id").where("playlist_id", "=", playlistId).orderBy("position").execute()
    ).map((r) => r.id);

  app.get("/playlists", async (req): Promise<PlaylistsResponse> => {
    const user = currentUser(req);
    const own = await ownPlaylists(db, user.id);
    const followed = await followedPlaylists(db, user.id);
    return { playlists: await summarize(db, user.id, [...own, ...followed.rows], followed.followedAt) };
  });

  app.post("/playlists", async (req, reply) => {
    const user = currentUser(req);
    const body = parse(createBody, req.body);
    const id = randomUUID();
    const timestamp = now().toISOString();
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("playlists")
        .values({
          id,
          owner_id: user.id,
          name: body.name,
          description: body.description ?? "",
          visibility: body.visibility ?? "private",
          created_at: timestamp,
          updated_at: timestamp,
        })
        .execute();
      const tracks = body.tracks ?? [];
      if (tracks.length) {
        await trx
          .insertInto("playlist_tracks")
          .values(
            tracks.map((t, position) => ({
              id: randomUUID(),
              playlist_id: id,
              position,
              ...trackColumns(t),
              added_at: timestamp,
              added_by: user.id,
            })),
          )
          .execute();
      }
    });
    return reply.status(201).send(await detail(user.id, id));
  });

  app.get("/playlists/:id", async (req): Promise<PlaylistResponse> => {
    const { user, row } = await visible(req);
    const response = await detail(user.id, row.id);
    const albumIds = [...new Set(response.tracks.flatMap((e) => (e.track.album ? [e.track.album.id] : [])))];
    if (albumIds.length) {
      void loadActiveAddons(db, service, config.secretKey, user.id, now(), config.ttl.manifest)
        .then((addons) => prefetch.meta(user.id, addons, albumIds, []))
        .catch(() => undefined);
    }
    return response;
  });

  app.patch("/playlists/:id", async (req): Promise<PlaylistResponse> => {
    const { user, row } = await owned(req);
    const body = parse(updateBody, req.body);
    await db
      .updateTable("playlists")
      .set({ ...body, updated_at: now().toISOString() })
      .where("id", "=", row.id)
      .execute();
    return detail(user.id, row.id);
  });

  app.delete("/playlists/:id", async (req, reply) => {
    const { row } = await owned(req);
    await db.deleteFrom("playlists").where("id", "=", row.id).execute();
    return reply.status(204).send();
  });

  app.post("/playlists/:id/tracks", async (req): Promise<PlaylistResponse> => {
    const { user, row } = await owned(req);
    const body = parse(addBody, req.body);
    const timestamp = now().toISOString();
    await db.transaction().execute(async (trx) => {
      const previous = await currentOrder(trx, row.id);
      if (previous.length + body.tracks.length > MAX_PLAYLIST_TRACKS) {
        throw badRequest(`A playlist holds at most ${MAX_PLAYLIST_TRACKS} tracks`, "playlist_full");
      }
      const added = body.tracks.map((t) => ({ id: randomUUID(), track: t }));
      const next = insertAt(previous, added.map((a) => a.id), body.position);
      await writeOrder(trx, previous, next);
      const index = new Map(next.map((id, i) => [id, i]));
      await trx
        .insertInto("playlist_tracks")
        .values(
          added.map((a) => ({
            id: a.id,
            playlist_id: row.id,
            position: index.get(a.id)!,
            ...trackColumns(a.track),
            added_at: timestamp,
            added_by: user.id,
          })),
        )
        .execute();
      await trx.updateTable("playlists").set({ updated_at: timestamp }).where("id", "=", row.id).execute();
    });
    return detail(user.id, row.id);
  });

  app.delete("/playlists/:id/tracks", async (req): Promise<PlaylistResponse> => {
    const { user, row } = await owned(req);
    const body = parse(removeBody, req.body);
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("playlist_tracks").where("playlist_id", "=", row.id).where("id", "in", body.entryIds).execute();
      // Positions are dense; the remaining entries close the gaps.
      const rest = await trx
        .selectFrom("playlist_tracks")
        .select(["id", "position"])
        .where("playlist_id", "=", row.id)
        .orderBy("position")
        .execute();
      for (const [position, entry] of rest.entries()) {
        if (entry.position !== position) {
          await trx.updateTable("playlist_tracks").set({ position }).where("id", "=", entry.id).execute();
        }
      }
      await trx.updateTable("playlists").set({ updated_at: now().toISOString() }).where("id", "=", row.id).execute();
    });
    return detail(user.id, row.id);
  });

  app.post("/playlists/:id/tracks/move", async (req): Promise<PlaylistResponse> => {
    const { user, row } = await owned(req);
    const body = parse(moveBody, req.body);
    await db.transaction().execute(async (trx) => {
      const previous = await currentOrder(trx, row.id);
      await writeOrder(trx, previous, moveEntries(previous, body.entryIds, body.beforeEntryId));
      await trx.updateTable("playlists").set({ updated_at: now().toISOString() }).where("id", "=", row.id).execute();
    });
    return detail(user.id, row.id);
  });

  app.put("/playlists/:id/follow", async (req): Promise<PlaylistResponse> => {
    const { user, row } = await visible(req);
    if (row.owner_id === user.id) throw badRequest("You cannot follow your own playlist", "own_playlist");
    await db
      .insertInto("playlist_follows")
      .values({ user_id: user.id, playlist_id: row.id, created_at: now().toISOString() })
      .onConflict((oc) => oc.columns(["user_id", "playlist_id"]).doNothing())
      .execute();
    return detail(user.id, row.id);
  });

  app.delete("/playlists/:id/follow", async (req, reply) => {
    const user = currentUser(req);
    const { id } = parse(idParams, req.params);
    await db.deleteFrom("playlist_follows").where("user_id", "=", user.id).where("playlist_id", "=", id).execute();
    return reply.status(204).send();
  });
}
