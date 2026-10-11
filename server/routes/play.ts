import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { STREAM_TIMEOUT_MS } from "../addons/http";
import { currentUser, requireUser } from "../auth/guard";
import { HttpError, notFound, parse } from "../http";

const MAX_HOPS = 5;
/** Response headers passed on when the add-on serves the audio itself. */
const RELAYED = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

const playParams = z.object({ token: z.string().min(20).max(100) });

const playFailed = () => new HttpError(502, "play_failed", "The stream add-on could not play this track.");

/**
 * `GET /api/play/:token`: plays one stream for the signed-in user. The server
 * asks the add-on's play URL itself and redirects the browser to the media URL
 * it points at, or relays the audio when the add-on serves it directly, so no
 * add-on URL reaches the browser.
 */
export default async function playRoutes(app: FastifyInstance): Promise<void> {
  const { db, playLinks: links, addonGuard, mediaFetch } = app.ctx;

  app.get("/play/:token", { preHandler: requireUser }, async (req, reply) => {
    const { token } = parse(playParams, req.params);
    const user = currentUser(req);
    const target = await links.resolve(user.id, token);
    const addon =
      target &&
      (await db
        .selectFrom("user_addons")
        .select("enabled")
        .where("id", "=", target.addonId)
        .where("user_id", "=", user.id)
        .executeTakeFirst());
    if (!target || !addon?.enabled) throw notFound("This play link has expired.", "play_expired");
    reply.header("Cache-Control", "no-store");

    const known = links.mediaUrl(target.tokenHash);
    if (known) return reply.redirect(known, 302);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
    reply.raw.on("close", () => controller.abort());
    const headers: Record<string, string> = {};
    if (typeof req.headers.range === "string") headers.Range = req.headers.range;

    let url = target.url;
    const origin = new URL(url).origin;
    try {
      for (let hop = 0; ; hop++) {
        let res: Response;
        try {
          await addonGuard.check(url);
          res = await mediaFetch(url, { redirect: "manual", signal: controller.signal, headers });
        } catch {
          throw playFailed();
        }
        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
          await res.body?.cancel();
          const next = new URL(location, url);
          // A redirect within the add-on is followed here; it would show the add-on URL.
          if (next.origin === origin) {
            if (hop >= MAX_HOPS) throw playFailed();
            url = next.toString();
            continue;
          }
          links.rememberMedia(target.tokenHash, next.toString());
          return reply.redirect(next.toString(), 302);
        }
        if ((res.status !== 200 && res.status !== 206) || !res.body) {
          await res.body?.cancel();
          throw playFailed();
        }
        clearTimeout(timer);
        reply.code(res.status);
        for (const name of RELAYED) {
          const value = res.headers.get(name);
          if (value) reply.header(name, value);
        }
        return reply.send(Readable.fromWeb(res.body as WebReadableStream));
      }
    } finally {
      clearTimeout(timer);
    }
  });
}
