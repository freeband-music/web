import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { CSRF_HEADER, CSRF_VALUE } from "../shared/api";
import type { Config } from "./config";
import type { AppContext, Deps } from "./context";
import { errorBody, installErrorHandler } from "./http";
import { routeModules } from "./routes/index";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface BuildOptions {
  logger?: boolean;
}

export async function buildApp(config: Config, deps: Deps, options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, trustProxy: config.trustProxy });
  const ctx: AppContext = { config, db: deps.db, now: deps.now ?? (() => new Date()) };
  app.decorate("ctx", ctx);
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
