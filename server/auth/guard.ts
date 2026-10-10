import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserInfo } from "../../shared/api";
import type { User } from "../db/schema";
import { forbidden, unauthorized } from "../http";
import { loadSession, type Auth } from "./sessions";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by `requireUser`. */
    auth: Auth | null;
  }
}

/** preHandler: 401 unless the request has a valid session; sets `req.auth`. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  req.auth = await loadSession(req, reply);
  if (!req.auth) throw unauthorized();
}

/** preHandler: like `requireUser`, and 403 unless the user is an admin. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireUser(req, reply);
  if (!req.auth?.user.is_admin) throw forbidden("Admin only");
}

/** The signed-in user; only valid in routes behind `requireUser` or `requireAdmin`. */
export function currentUser(req: FastifyRequest): User {
  if (!req.auth) throw unauthorized();
  return req.auth.user;
}

export function toUserInfo(user: User): UserInfo {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    isAdmin: user.is_admin === 1,
    createdAt: user.created_at,
  };
}
