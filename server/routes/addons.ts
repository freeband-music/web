import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AddonFailure, AddonResponse, AddonsResponse } from "../../shared/api";
import { AddonError } from "../addons/http";
import { BlockedAddonError } from "../addons/network";
import { listAddonRows, refreshManifest, toAddonInfo, writeOrder } from "../addons/store";
import { normalizeAddonUrl, splitAddonUrl } from "../addons/urls";
import { currentUser, requireUser } from "../auth/guard";
import { encrypt, sha256Hex } from "../crypto";
import { badRequest, conflict, notFound, parse } from "../http";

const MAX_ADDONS = 50;

const installBody = z.object({ url: z.string().min(1).max(4096) });
const idParams = z.object({ id: z.string().min(1) });
const updateBody = z.object({ enabled: z.boolean().optional(), position: z.number().int().min(0).optional() });
const orderBody = z.object({ ids: z.array(z.string().min(1)).max(MAX_ADDONS) });

export default async function addonRoutes(app: FastifyInstance): Promise<void> {
  const { db, now, config, addons: service } = app.ctx;
  app.addHook("preHandler", requireUser);

  const list = async (userId: string): Promise<AddonsResponse> => ({
    addons: (await listAddonRows(db, userId)).map(toAddonInfo),
  });

  const findRow = async (userId: string, id: string) => {
    const row = await db
      .selectFrom("user_addons")
      .selectAll()
      .where("id", "=", id)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    if (!row) throw notFound("No such add-on");
    return row;
  };

  app.get("/addons", async (req) => list(currentUser(req).id));

  app.post("/addons", async (req): Promise<AddonResponse> => {
    const user = currentUser(req);
    const url = normalizeAddonUrl(parse(installBody, req.body).url);
    const urlHash = sha256Hex(url);
    const rows = await listAddonRows(db, user.id);
    if (rows.some((r) => r.url_hash === urlHash)) throw conflict("This add-on is already installed", "addon_exists");
    if (rows.length >= MAX_ADDONS) throw badRequest(`At most ${MAX_ADDONS} add-ons can be installed`);
    let manifest;
    try {
      manifest = await service.fetchManifest(url);
    } catch (err) {
      if (err instanceof BlockedAddonError) throw badRequest(err.message, "addon_blocked");
      if (err instanceof AddonError) throw badRequest(err.message, "addon_invalid");
      throw err;
    }
    const { baseUrl, hasConfig } = splitAddonUrl(url);
    const timestamp = now().toISOString();
    const row = {
      id: randomUUID(),
      user_id: user.id,
      position: rows.length,
      enabled: 1,
      url_encrypted: encrypt(url, config.secretKey),
      url_hash: urlHash,
      base_url: baseUrl,
      has_config: hasConfig ? 1 : 0,
      manifest_json: JSON.stringify(manifest),
      manifest_fetched_at: timestamp,
      created_at: timestamp,
    };
    await db.insertInto("user_addons").values(row).execute();
    return { addon: toAddonInfo(row) };
  });

  app.patch("/addons/:id", async (req): Promise<AddonResponse> => {
    const user = currentUser(req);
    const { id } = parse(idParams, req.params);
    const body = parse(updateBody, req.body);
    await findRow(user.id, id);
    if (body.enabled !== undefined) {
      await db.updateTable("user_addons").set({ enabled: body.enabled ? 1 : 0 }).where("id", "=", id).execute();
    }
    if (body.position !== undefined) {
      const ids = (await listAddonRows(db, user.id)).map((r) => r.id).filter((x) => x !== id);
      ids.splice(Math.min(body.position, ids.length), 0, id);
      await writeOrder(db, user.id, ids);
    }
    return { addon: toAddonInfo(await findRow(user.id, id)) };
  });

  app.put("/addons/order", async (req): Promise<AddonsResponse> => {
    const user = currentUser(req);
    const { ids } = parse(orderBody, req.body);
    const current = (await listAddonRows(db, user.id)).map((r) => r.id);
    if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((x) => current.includes(x))) {
      throw badRequest("ids must list every installed add-on exactly once");
    }
    await writeOrder(db, user.id, ids);
    return list(user.id);
  });

  app.delete("/addons/:id", async (req, reply) => {
    const user = currentUser(req);
    const { id } = parse(idParams, req.params);
    await findRow(user.id, id);
    await db.deleteFrom("user_addons").where("id", "=", id).execute();
    await writeOrder(db, user.id, (await listAddonRows(db, user.id)).map((r) => r.id));
    return reply.status(204).send();
  });

  app.post("/addons/refresh", async (req): Promise<AddonsResponse> => {
    const user = currentUser(req);
    const rows = await listAddonRows(db, user.id);
    const errors: AddonFailure[] = [];
    await Promise.all(
      rows.map((row) =>
        refreshManifest(db, service, row, config.secretKey, now().toISOString()).catch((err: unknown) => {
          if (!(err instanceof AddonError)) throw err;
          errors.push({ addonId: row.id, name: JSON.parse(row.manifest_json).name, message: err.message });
        }),
      ),
    );
    return { ...(await list(user.id)), errors };
  });
}
