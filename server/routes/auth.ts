import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthConfigResponse, MeResponse } from "../../shared/api";
import { currentUser, requireUser, toUserInfo } from "../auth/guard";
import { dummyHash, hashPassword, verifyPassword } from "../auth/password";
import { clearSessionCookie, SESSION_COOKIE, startSession } from "../auth/sessions";
import { displayNameSchema, passwordSchema, usernameSchema } from "../auth/validation";
import { sha256Hex } from "../crypto";
import { conflict, forbidden, HttpError, parse, unauthorized } from "../http";
import { getSignupMode } from "../settings";

const signupBody = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
  invite: z.string().trim().min(1).optional(),
});

const loginBody = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(256) });

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db, now } = app.ctx;

  app.get("/auth/config", async (): Promise<AuthConfigResponse> => {
    const any = await db.selectFrom("users").select("id").limit(1).executeTakeFirst();
    return { signup: await getSignupMode(app.ctx), hasUsers: any !== undefined, allowDownloads: app.ctx.config.allowDownloads };
  });

  app.post("/auth/signup", async (req, reply): Promise<MeResponse> => {
    const body = parse(signupBody, req.body);
    const mode = await getSignupMode(app.ctx);
    const passwordHash = await hashPassword(body.password);
    const at = now().toISOString();
    const id = randomUUID();

    await db.transaction().execute(async (trx) => {
      const first = (await trx.selectFrom("users").select("id").limit(1).executeTakeFirst()) === undefined;
      if (!first && mode === "closed") throw forbidden("Sign-up is closed", "signup_closed");
      if (!first && mode === "invite" && !body.invite) throw forbidden("An invite code is required", "invite_required");
      const lower = body.username.toLowerCase();
      const taken = await trx.selectFrom("users").select("id").where("username_lower", "=", lower).executeTakeFirst();
      if (taken) throw conflict("That username is taken", "username_taken");
      await trx
        .insertInto("users")
        .values({
          id,
          username: body.username,
          username_lower: lower,
          display_name: body.displayName ?? body.username,
          password_hash: passwordHash,
          is_admin: first ? 1 : 0,
          created_at: at,
        })
        .execute();
      if (!first && mode === "invite") {
        const used = await trx
          .updateTable("invites")
          .set({ used_by: id, used_at: at })
          .where("code", "=", body.invite ?? "")
          .where("used_by", "is", null)
          .executeTakeFirst();
        if (used.numUpdatedRows !== 1n) throw forbidden("That invite code is not valid", "invite_invalid");
      }
    });

    await startSession(req, reply, id);
    const user = await db.selectFrom("users").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    return { user: toUserInfo(user) };
  });

  app.post("/auth/login", async (req, reply): Promise<MeResponse> => {
    const body = parse(loginBody, req.body);
    const lower = body.username.toLowerCase();
    const key = `${req.ip}|${lower}`;
    const ms = now().getTime();
    const wait = app.ctx.loginLimiter.blockedFor(key, ms);
    if (wait > 0) {
      reply.header("Retry-After", Math.ceil(wait / 1000));
      throw new HttpError(429, "too_many_attempts", "Too many failed sign-in attempts; try again later");
    }
    const user = await db.selectFrom("users").selectAll().where("username_lower", "=", lower).executeTakeFirst();
    const ok = await verifyPassword(body.password, user?.password_hash ?? (await dummyHash));
    if (!user || !ok) {
      app.ctx.loginLimiter.fail(key, ms);
      throw unauthorized("Wrong username or password", "invalid_credentials");
    }
    app.ctx.loginLimiter.reset(key);
    await startSession(req, reply, user.id);
    return { user: toUserInfo(user) };
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await db.deleteFrom("sessions").where("id", "=", sha256Hex(token)).execute();
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get("/auth/me", { preHandler: requireUser }, async (req): Promise<MeResponse> => ({
    user: toUserInfo(currentUser(req)),
  }));
}
