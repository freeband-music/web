import type { RateLimiter } from "./auth/rate-limit";
import type { Config } from "./config";
import type { Db } from "./db/index";

/** Dependencies `buildApp` takes; tests pass an in-memory database and a fixed clock. */
export interface Deps {
  db: Db;
  now?: () => Date;
}

/** Available to every route as `app.ctx` (or `req.server.ctx`). */
export interface AppContext {
  config: Config;
  db: Db;
  now: () => Date;
  /** Failed sign-ins per IP and username. */
  loginLimiter: RateLimiter;
}

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
  }
}
