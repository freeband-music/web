import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { InviteInfo, InviteResponse, InvitesResponse, ServerSettings, UsersResponse } from "../../shared/api";
import { SIGNUP_MODES } from "../config";
import { currentUser, requireAdmin, toUserInfo } from "../auth/guard";
import { hashPassword } from "../auth/password";
import { passwordSchema } from "../auth/validation";
import { randomToken } from "../crypto";
import type { Invite } from "../db/schema";
import { badRequest, notFound, parse } from "../http";
import { getSignupMode, setSetting } from "../settings";

const idParams = z.object({ id: z.string().min(1) });
const codeParams = z.object({ code: z.string().min(1) });
const passwordBody = z.object({ password: passwordSchema });
const settingsBody = z.object({ signup: z.enum(SIGNUP_MODES) });

function toInviteInfo(i: Invite): InviteInfo {
  return { code: i.code, createdBy: i.created_by, createdAt: i.created_at, usedBy: i.used_by, usedAt: i.used_at };
}

export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  const { db, now } = app.ctx;
  app.addHook("preHandler", requireAdmin);

  app.get("/admin/users", async (): Promise<UsersResponse> => {
    const users = await db.selectFrom("users").selectAll().orderBy("created_at").execute();
    return { users: users.map(toUserInfo) };
  });

  app.delete("/admin/users/:id", async (req, reply) => {
    const { id } = parse(idParams, req.params);
    if (id === currentUser(req).id) throw badRequest("You cannot delete your own account here", "self");
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("sessions").where("user_id", "=", id).execute();
      await trx.updateTable("invites").set({ created_by: null }).where("created_by", "=", id).execute();
      await trx.updateTable("invites").set({ used_by: null }).where("used_by", "=", id).execute();
      const result = await trx.deleteFrom("users").where("id", "=", id).executeTakeFirst();
      if (result.numDeletedRows === 0n) throw notFound("No such user");
    });
    return reply.status(204).send();
  });

  app.post("/admin/users/:id/password", async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const { password } = parse(passwordBody, req.body);
    const hash = await hashPassword(password);
    const result = await db.updateTable("users").set({ password_hash: hash }).where("id", "=", id).executeTakeFirst();
    if (result.numUpdatedRows === 0n) throw notFound("No such user");
    await db.deleteFrom("sessions").where("user_id", "=", id).execute();
    return reply.status(204).send();
  });

  app.get("/admin/settings", async (): Promise<ServerSettings> => ({ signup: await getSignupMode(app.ctx) }));

  app.put("/admin/settings", async (req): Promise<ServerSettings> => {
    const body = parse(settingsBody, req.body);
    await setSetting(db, "signup", body.signup);
    return { signup: body.signup };
  });

  app.post("/admin/cache/clear", async (_req, reply) => {
    await app.ctx.cache.clear();
    return reply.status(204).send();
  });

  app.get("/admin/invites", async (): Promise<InvitesResponse> => {
    const invites = await db.selectFrom("invites").selectAll().orderBy("created_at", "desc").execute();
    return { invites: invites.map(toInviteInfo) };
  });

  app.post("/admin/invites", async (req): Promise<InviteResponse> => {
    const invite: Invite = {
      code: randomToken(9),
      created_by: currentUser(req).id,
      created_at: now().toISOString(),
      used_by: null,
      used_at: null,
    };
    await db.insertInto("invites").values(invite).execute();
    return { invite: toInviteInfo(invite) };
  });

  app.delete("/admin/invites/:code", async (req, reply) => {
    const { code } = parse(codeParams, req.params);
    const result = await db.deleteFrom("invites").where("code", "=", code).executeTakeFirst();
    if (result.numDeletedRows === 0n) throw notFound("No such invite");
    return reply.status(204).send();
  });
}
