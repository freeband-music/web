import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { CSRF_HEADER, CSRF_VALUE } from "../shared/api";
import { defaultFetch } from "./addons/http";
import { AddonNetworkGuard } from "./addons/network";
import { PrefetchManager } from "./addons/prefetch";
import { PlayLinks } from "./play/links";
import { AddonService } from "./addons/service";
import { RateLimiter } from "./auth/rate-limit";
import { Cache, DbCacheStore } from "./cache/cache";
import type { Config } from "./config";
import type { AppContext, Deps } from "./context";
import { errorBody, installErrorHandler } from "./http";
import { routeModules } from "./routes/index";
import { getBlockPrivateAddons } from "./settings";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PURGE_INTERVAL_MS = 10 * 60 * 1000;

export interface BuildOptions {
  logger?: boolean;
}

export async function buildApp(config: Config, deps: Deps, options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, trustProxy: config.trustProxy });
  const now = deps.now ?? (() => new Date());
  const cache = new Cache(new DbCacheStore(deps.db), now);
  const addonGuard = new AddonNetworkGuard(deps.lookup);
  addonGuard.blockPrivate = await getBlockPrivateAddons(deps.db);
  const fetchFn = deps.fetch ?? defaultFetch;
  const addons = new AddonService(cache, config.ttl, addonGuard.wrap(fetchFn));
  const ctx: AppContext = {
    config,
    db: deps.db,
    now,
    loginLimiter: new RateLimiter(5, 15 * 60 * 1000),
    cache,
    addons,
    addonGuard,
    prefetch: new PrefetchManager(addons, config.prefetch),
    playLinks: new PlayLinks(deps.db, config.secretKey, now),
    mediaFetch: fetchFn,
  };
  app.decorate("ctx", ctx);

  const purge = setInterval(() => {
    cache.purge().catch((err) => app.log.error(err, "cache purge failed"));
    ctx.playLinks.purge().catch((err) => app.log.error(err, "play link purge failed"));
  }, PURGE_INTERVAL_MS);
  purge.unref();
  app.addHook("onClose", async () => {
    clearInterval(purge);
    ctx.prefetch.stopAll();
  });
  app.decorateRequest("auth", null);
  installErrorHandler(app);
  await app.register(cookie);

  // CSRF: a cross-site form cannot set a custom header or a JSON content type.
  app.addHook("onRequest", async (req, reply) => {
    if (!MUTATING.has(req.method) || !req.url.startsWith("/api/")) return;
    const header = req.headers[CSRF_HEADER.toLowerCase()];
    const type = req.headers["content-type"] ?? "";
    if (header === CSRF_VALUE || type.startsWith("application/json")) return;
    return reply.status(403).send(errorBody("csrf", `Missing ${CSRF_HEADER} header`));
  });

  await app.register(
    async (api) => {
      for (const mod of routeModules) await api.register(mod);
    },
    { prefix: "/api" },
  );

  const staticDir = resolve(config.staticDir);
  const hasClient = existsSync(resolve(staticDir, "index.html"));
  if (hasClient) await app.register(fastifyStatic, { root: staticDir, wildcard: false });

  app.setNotFoundHandler((req, reply) => {
    if (hasClient && req.method === "GET" && !req.url.startsWith("/api/")) {
      return reply.sendFile("index.html");
    }
    return reply.status(404).send(errorBody("not_found", "Not found"));
  });

  return app;
}
