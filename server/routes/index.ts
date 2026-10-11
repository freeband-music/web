import type { FastifyInstance } from "fastify";
import accountRoutes from "./account";
import addonRoutes from "./addons";
import adminRoutes from "./admin";
import authRoutes from "./auth";
import healthRoutes from "./health";
import historyRoutes from "./history";
import libraryRoutes from "./library";
import meRoutes from "./me";
import playRoutes from "./play";
import playlistRoutes from "./playlists";
import proxyRoutes from "./proxy";
import userRoutes from "./users";

export type RouteModule = (app: FastifyInstance) => Promise<void>;

/** Route modules, each registered under `/api`. Add new modules here. */
export const routeModules: RouteModule[] = [
  healthRoutes,
  authRoutes,
  accountRoutes,
  adminRoutes,
  addonRoutes,
  proxyRoutes,
  playRoutes,
  playlistRoutes,
  libraryRoutes,
  historyRoutes,
  meRoutes,
  userRoutes,
];
