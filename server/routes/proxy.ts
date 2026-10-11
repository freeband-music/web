import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AddonSearchResponse, PrefetchResponse, StreamResolveResponse, TrackSummary } from "../../shared/api";
import { trackSummarySchema } from "../addons/schemas";
import { withoutDownloads, type ActiveAddon } from "../addons/service";
import { loadActiveAddons } from "../addons/store";
import { currentUser, requireUser } from "../auth/guard";
import { parse } from "../http";
import { userDownloadsPermitted } from "../settings";

const MAX_QUEUE = 1000;

const searchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  type: z.enum(["track", "album", "artist"]).optional(),
});
const metaParams = z.object({ kind: z.enum(["artist", "album", "track"]), id: z.string().min(1).max(512) });
const streamBody = z.object({ track: trackSummarySchema, allowQueue: z.boolean().optional() });
const prefetchBody = z.object({
  tracks: z.array(trackSummarySchema).max(MAX_QUEUE),
  current: z.number().int().min(-1).optional(),
});
const prefetchMetaBody = z.object({
  albumIds: z.array(z.string().min(1).max(512)).max(MAX_QUEUE).optional(),
  trackIds: z.array(z.string().min(1).max(512)).max(MAX_QUEUE).optional(),
});

/** Search, metadata and stream requests on behalf of the signed-in user, through the cache. */
export default async function proxyRoutes(app: FastifyInstance): Promise<void> {
  const { db, now, config, addons: service, prefetch } = app.ctx;
  app.addHook("preHandler", requireUser);

  const active = (req: FastifyRequest) =>
    loadActiveAddons(db, service, config.secretKey, currentUser(req).id, now(), config.ttl.manifest);

  app.get("/search", async (req): Promise<AddonSearchResponse> => {
    const { q, type } = parse(searchQuery, req.query);
    return service.search(await active(req), q, type);
  });

  app.get("/meta/:kind/:id", async (req) => {
    const { kind, id } = parse(metaParams, req.params);
    return service.meta(await active(req), kind, id);
  });

  app.post("/stream", async (req): Promise<StreamResolveResponse> => {
    const body = parse(streamBody, req.body);
    // The request can only narrow what the server and the user allow.
    const userId = currentUser(req).id;
    const downloads = await userDownloadsPermitted(app.ctx, userId);
    // The browser only ever gets play links; add-on URLs may carry the user's credentials.
    const link = (addon: ActiveAddon, url: string) => app.ctx.playLinks.issue(userId, addon.id, url);
    const allowQueue = downloads && (body.allowQueue ?? true);
    const response = await service.streams(await active(req), body.track as TrackSummary, allowQueue, link);
    return downloads ? response : withoutDownloads(response);
  });

  app.post("/prefetch", async (req, reply) => {
    const body = parse(prefetchBody, req.body);
    const upcoming = body.tracks.slice((body.current ?? -1) + 1) as TrackSummary[];
    const userId = currentUser(req).id;
    const planned = await prefetch.streams(userId, await active(req), upcoming, await userDownloadsPermitted(app.ctx, userId));
    return reply.status(202).send({ planned } satisfies PrefetchResponse);
  });

  app.post("/prefetch/meta", async (req, reply) => {
    const body = parse(prefetchMetaBody, req.body);
    const planned = prefetch.meta(currentUser(req).id, await active(req), body.albumIds ?? [], body.trackIds ?? []);
    return reply.status(202).send({ planned } satisfies PrefetchResponse);
  });
}
