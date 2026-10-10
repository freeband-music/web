import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MeResponse, SessionsResponse } from "../../shared/api";
import { currentUser, requireUser, toUserInfo } from "../auth/guard";
import { hashPassword, verifyPassword } from "../auth/password";
import { clearSessionCookie } from "../auth/sessions";
import { displayNameSchema, passwordSchema } from "../auth/validation";
import { forbidden, notFound, parse } from "../http";

const passwordBody = z.object({ current: z.string().min(1).max(256), new: passwordSchema });
const profileBody = z.object({ displayName: displayNameSchema });
const sessionParams = z.object({ id: z.string().min(1) });

export default async function accountRoutes(app: FastifyInstance): Promise<void> {
  const { db, now } = app.ctx;
  app.addHook("preHandler", requireUser);

  app.post("/account/password", async (req, reply) => {
    const body = parse(passwordBody, req.body);
    const user = currentUser(req);
    if (!(await verifyPassword(body.current, user.password_hash))) {
      throw forbidden("The current password is wrong", "invalid_credentials");
    }
    await db.updateTable("users").set({ password_hash: await hashPassword(body.new) }).where("id", "=", user.id).execute();
    await db
      .deleteFrom("sessions")
      .where("user_id", "=", user.id)
      .where("id", "!=", req.auth!.session.id)
      .execute();
    return reply.status(204).send();
  });

  app.get("/account/sessions", async (req): Promise<SessionsResponse> => {
    const rows = await db
      .selectFrom("sessions")
      .selectAll()
      .where("user_id", "=", currentUser(req).id)
      .where("expires_at", ">", now().toISOString())
      .orderBy("last_seen_at", "desc")
      .execute();
    return {
      sessions: rows.map((s) => ({
        id: s.id,
        createdAt: s.created_at,
        lastSeenAt: s.last_seen_at,
        expiresAt: s.expires_at,
        userAgent: s.user_agent,
        current: s.id === req.auth!.session.id,
      })),
    };
  });

  app.delete("/account/sessions/:id", async (req, reply) => {
    const { id } = parse(sessionParams, req.params);
    const result = await db
      .deleteFrom("sessions")
      .where("id", "=", id)
      .where("user_id", "=", currentUser(req).id)
      .executeTakeFirst();
    if (result.numDeletedRows === 0n) throw notFound("No such session");
    if (id === req.auth!.session.id) clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.patch("/account/profile", async (req): Promise<MeResponse> => {
    const { displayName } = parse(profileBody, req.body);
    const user = currentUser(req);
    await db.updateTable("users").set({ display_name: displayName }).where("id", "=", user.id).execute();
    return { user: toUserInfo({ ...user, display_name: displayName }) };
  });
}
