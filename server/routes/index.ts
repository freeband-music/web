import type { FastifyInstance } from "fastify";
import healthRoutes from "./health";

export type RouteModule = (app: FastifyInstance) => Promise<void>;

/** Route modules, each registered under `/api`. Add new modules here. */
export const routeModules: RouteModule[] = [healthRoutes];
