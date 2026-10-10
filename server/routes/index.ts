import type { FastifyInstance } from "fastify";
import accountRoutes from "./account";
import addonRoutes from "./addons";
import adminRoutes from "./admin";
import authRoutes from "./auth";
import healthRoutes from "./health";
import libraryRoutes from "./library";
import playlistRoutes from "./playlists";
import proxyRoutes from "./proxy";

export type RouteModule = (app: FastifyInstance) => Promise<void>;

/** Route modules, each registered under `/api`. Add new modules here. */
export const routeModules: RouteModule[] = [healthRoutes, authRoutes, accountRoutes, adminRoutes, addonRoutes, proxyRoutes, playlistRoutes, libraryRoutes];
