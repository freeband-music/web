import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RecentContext, RecentResponse, StatsResponse } from "../../shared/api";
import { currentUser, requireUser } from "../auth/guard";
import { badRequest, parse } from "../http";
import { canView, playlistQuery, summarize } from "../library/playlists";
import { trackSnapshotSchema } from "../library/snapshots";
import { listeningStats } from "../library/stats";

const RECENT = 20;
/** A play may be dated at most this far ahead of the server clock. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const text = z.string().max(1000);
const playBody = z.object({
  track: trackSnapshotSchema,
  msPlayed: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  playedAt: z.iso.datetime().optional(),
  context: z
    .object({
      type: z.enum(["album", "playlist", "artist", "search", "queue"]),
      id: z.string().min(1).max(512).optional(),
      name: text.optional(),
      image: z.string().max(4096).optional(),
    })
    .optional(),
});
const statsQuery = z.object({ range: z.enum(["4w", "6m", "all"]).default("4w") });

export default async function historyRoutes(app: FastifyInstance): Promise<void> {
  const { db, now } = app.ctx;
  app.addHook("preHandler", requireUser);

  app.post("/history/plays", async (req, reply) => {
    const user = currentUser(req);
    const body = parse(playBody, req.body);
    const playedAt = body.playedAt ? new Date(body.playedAt) : now();
    if (playedAt.getTime() > now().getTime() + CLOCK_SKEW_MS) throw badRequest("playedAt is in the future");
    const context = body.context ?? { type: "queue" as const };
    const main = body.track.artists[0];
    await db
      .insertInto("plays")
      .values({
        id: randomUUID(),
        user_id: user.id,
        track_id: body.track.id,
        artist_id: main.id,
        artist_name: main.name,
        album_id: body.track.album?.id ?? null,
        snapshot_json: JSON.stringify(body.track),
        played_at: playedAt.toISOString(),
        ms_played: body.msPlayed,
        context_type: context.type,
        context_id: context.id ?? null,
        context_name: context.name ?? null,
        context_image: context.image ?? null,
      })
      .execute();
    return reply.status(204).send();
  });

  app.get("/history/recent", async (req): Promise<RecentResponse> => {
    const user = currentUser(req);
    const rows = await db
      .selectFrom("plays")
      .select((eb) => [
        "context_type",
        "context_id",
        eb.fn.max("played_at").as("last"),
        eb.fn.max("context_name").as("name"),
        eb.fn.max("context_image").as("image"),
      ])
      .where("user_id", "=", user.id)
      .where("context_type", "in", ["album", "playlist", "artist"])
      .where("context_id", "is not", null)
      .groupBy(["context_type", "context_id"])
      .orderBy("last", "desc")
      .limit(RECENT * 2)
      .execute();

    // Playlists show their current name and covers, and drop out once deleted or made private.
    const playlistIds = rows.flatMap((r) => (r.context_type === "playlist" ? [r.context_id!] : []));
    const playlists = playlistIds.length
      ? (await playlistQuery(db).where("playlists.id", "in", playlistIds).execute()).filter((p) => canView(p, user.id))
      : [];
    const summaries = new Map((await summarize(db, user.id, playlists)).map((p) => [p.id, p]));

    const contexts = rows.flatMap((r): RecentContext[] => {
      const base = { id: r.context_id!, lastPlayedAt: r.last };
      if (r.context_type === "playlist") {
        const p = summaries.get(r.context_id!);
        return p ? [{ ...base, type: "playlist", name: p.name, covers: p.covers }] : [];
      }
      const type = r.context_type as "album" | "artist";
      return [{ ...base, type, name: r.name ?? "", ...(r.image ? { image: r.image } : {}) }];
    });
    return { contexts: contexts.slice(0, RECENT) };
  });

  app.get("/stats", async (req): Promise<StatsResponse> => {
    const { range } = parse(statsQuery, req.query);
    return listeningStats(db, currentUser(req).id, range, now());
  });
}
