import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppContext } from "../context";
import { randomToken, sha256Hex } from "../crypto";
import type { Session, User } from "../db/schema";

export const SESSION_COOKIE = "fb_session";
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
/** Sliding expiry is refreshed at most this often, to avoid a write per request. */
const REFRESH_MS = 60 * 1000;

export interface Auth {
  user: User;
  session: Session;
}

function setCookie(req: FastifyRequest, reply: FastifyReply, token: string): void {
  const { cookieSecure } = req.server.ctx.config;
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookieSecure === "auto" ? req.protocol === "https" : cookieSecure,
    maxAge: SESSION_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Creates a session for the user and sets its cookie. */
export async function startSession(req: FastifyRequest, reply: FastifyReply, userId: string): Promise<void> {
  const { db, now } = req.server.ctx;
  const token = randomToken(32);
  const at = now();
  await db.deleteFrom("sessions").where("user_id", "=", userId).where("expires_at", "<=", at.toISOString()).execute();
  await db
    .insertInto("sessions")
    .values({
      id: sha256Hex(token),
      user_id: userId,
      created_at: at.toISOString(),
      last_seen_at: at.toISOString(),
      expires_at: new Date(at.getTime() + SESSION_MS).toISOString(),
      user_agent: req.headers["user-agent"]?.slice(0, 300) ?? null,
    })
    .execute();
  setCookie(req, reply, token);
}

/** Looks up the session cookie, sliding its expiry; null if absent, unknown or expired. */
export async function loadSession(req: FastifyRequest, reply: FastifyReply): Promise<Auth | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;
  const ctx: AppContext = req.server.ctx;
  const id = sha256Hex(token);
  const session = await ctx.db.selectFrom("sessions").selectAll().where("id", "=", id).executeTakeFirst();
  if (!session) return null;
  const at = ctx.now();
  if (session.expires_at <= at.toISOString()) {
    await ctx.db.deleteFrom("sessions").where("id", "=", id).execute();
    return null;
  }
  const user = await ctx.db.selectFrom("users").selectAll().where("id", "=", session.user_id).executeTakeFirst();
  if (!user) return null;
  if (at.getTime() - Date.parse(session.last_seen_at) >= REFRESH_MS) {
    session.last_seen_at = at.toISOString();
    session.expires_at = new Date(at.getTime() + SESSION_MS).toISOString();
    await ctx.db
      .updateTable("sessions")
      .set({ last_seen_at: session.last_seen_at, expires_at: session.expires_at })
      .where("id", "=", id)
      .execute();
    setCookie(req, reply, token);
  }
  return { user, session };
}
