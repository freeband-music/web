import type { FetchFn } from "./addons/http";
import type { AddonNetworkGuard, LookupFn } from "./addons/network";
import type { PrefetchManager } from "./addons/prefetch";
import type { AddonService } from "./addons/service";
import type { RateLimiter } from "./auth/rate-limit";
import type { Cache } from "./cache/cache";
import type { Config } from "./config";
import type { Db } from "./db/index";

/** Dependencies `buildApp` takes; tests pass an in-memory database and a fixed clock. */
export interface Deps {
  db: Db;
  now?: () => Date;
  /** HTTP client for add-on requests; defaults to the global `fetch`. */
  fetch?: FetchFn;
  /** Host name resolver for the private-network check; defaults to DNS. */
  lookup?: LookupFn;
}

/** Available to every route as `app.ctx` (or `req.server.ctx`). */
export interface AppContext {
  config: Config;
  db: Db;
  now: () => Date;
  /** Failed sign-ins per IP and username. */
  loginLimiter: RateLimiter;
  cache: Cache;
  addons: AddonService;
  /** Refuses add-on requests to private network addresses when the admin turns it on. */
  addonGuard: AddonNetworkGuard;
  prefetch: PrefetchManager;
}

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
  }
}
