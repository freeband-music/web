import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PlaylistSearchResponse, ProfileResponse } from "../../shared/api";
import { currentUser, requireUser } from "../auth/guard";
import { notFound, parse } from "../http";
import { followedPlaylists, playlistQuery, summarize } from "../library/playlists";

const SEARCH_LIMIT = 50;

const searchQuery = z.object({ q: z.string().trim().min(1).max(200) });
const usernameParams = z.object({ username: z.string().min(1).max(64) });

/** Playlist search and profile pages. */
export default async function userRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;
  app.addHook("preHandler", requireUser);

  app.get("/search/playlists", async (req): Promise<PlaylistSearchResponse> => {
    const user = currentUser(req);
    const needle = parse(searchQuery, req.query).q.toLowerCase();
    const pattern = `%${needle}%`;
    const rows = await playlistQuery(db)
      .where((eb) =>
        eb.and([
          eb.or([eb("playlists.owner_id", "=", user.id), eb("playlists.visibility", "=", "public")]),
          eb.or([
            eb(eb.fn("lower", ["playlists.name"]), "like", pattern),
            eb(eb.fn("lower", ["playlists.description"]), "like", pattern),
          ]),
        ]),
      )
      .orderBy("playlists.updated_at", "desc")
      .limit(SEARCH_LIMIT * 2)
      .execute();
    // `%` and `_` in the query act as wildcards in LIKE; keep only real substring matches.
    const matches = rows
      .filter((r) => r.name.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.owner_id === user.id) - Number(a.owner_id === user.id))
      .slice(0, SEARCH_LIMIT);
    const { followedAt } = await followedPlaylists(db, user.id);
    return { playlists: await summarize(db, user.id, matches, followedAt) };
  });

  app.get("/users/:username", async (req): Promise<ProfileResponse> => {
    const viewer = currentUser(req);
    const { username } = parse(usernameParams, req.params);
    const user = await db
      .selectFrom("users")
      .select(["id", "username", "display_name"])
      .where("username_lower", "=", username.toLowerCase())
      .executeTakeFirst();
    if (!user) throw notFound("No such user");
    const rows = await playlistQuery(db)
      .where("playlists.owner_id", "=", user.id)
      .where("playlists.visibility", "=", "public")
      .orderBy("playlists.updated_at", "desc")
      .execute();
    const { followedAt } = await followedPlaylists(db, viewer.id);
    return {
      user: { username: user.username, displayName: user.display_name },
      playlists: await summarize(db, viewer.id, rows, followedAt),
    };
  });
}
