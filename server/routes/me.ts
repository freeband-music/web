import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PlaybackResponse, PlaybackSavedResponse, PlaybackState, SettingsResponse, UserSettings } from "../../shared/api";
import { currentUser, requireUser } from "../auth/guard";
import { badRequest, parse } from "../http";
import { trackSnapshotSchema } from "../library/snapshots";

export const MAX_QUEUE = 1000;
const MAX_SETTINGS = 64 * 1024;

const settingsBody = z.object({ settings: z.record(z.string(), z.unknown()) });
const playbackBody = z.object({
  queue: z.array(trackSnapshotSchema).max(MAX_QUEUE).optional(),
  originalOrder: z.array(z.number().int().min(0)).max(MAX_QUEUE).optional(),
  index: z.number().int().min(0),
  positionMs: z.number().int().min(0),
  shuffle: z.boolean(),
  repeat: z.enum(["off", "all", "one"]),
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
  context: z
    .object({
      type: z.enum(["album", "playlist", "artist", "search", "queue"]),
      id: z.string().max(512).optional(),
      name: z.string().max(1000).optional(),
      image: z.string().max(4096).optional(),
    })
    .optional(),
});

/** Settings and playback state, synced between the user's devices (last write wins). */
export default async function meRoutes(app: FastifyInstance): Promise<void> {
  const { db, now } = app.ctx;
  app.addHook("preHandler", requireUser);

  app.get("/me/settings", async (req): Promise<SettingsResponse> => {
    const row = await db.selectFrom("user_settings").selectAll().where("user_id", "=", currentUser(req).id).executeTakeFirst();
    return { settings: row ? (JSON.parse(row.settings_json) as UserSettings) : {}, updatedAt: row?.updated_at ?? null };
  });

  app.put("/me/settings", async (req): Promise<SettingsResponse> => {
    const { settings } = parse(settingsBody, req.body);
    const settings_json = JSON.stringify(settings);
    if (settings_json.length > MAX_SETTINGS) throw badRequest("Settings are too large");
    const updated_at = now().toISOString();
    await db
      .insertInto("user_settings")
      .values({ user_id: currentUser(req).id, settings_json, updated_at })
      .onConflict((oc) => oc.column("user_id").doUpdateSet({ settings_json, updated_at }))
      .execute();
    return { settings, updatedAt: updated_at };
  });

  app.get("/me/playback", async (req): Promise<PlaybackResponse> => {
    const row = await db.selectFrom("playback_state").selectAll().where("user_id", "=", currentUser(req).id).executeTakeFirst();
    if (!row) return { playback: null, updatedAt: null };
    const playback = { ...JSON.parse(row.queue_json), ...JSON.parse(row.state_json) } as PlaybackState;
    return { playback, updatedAt: row.updated_at };
  });

  app.put("/me/playback", async (req): Promise<PlaybackSavedResponse> => {
    const { queue, originalOrder, ...state } = parse(playbackBody, req.body);
    const user_id = currentUser(req).id;
    const updated_at = now().toISOString();
    const state_json = JSON.stringify(state);
    // Without a queue only the small state is written; the stored queue stays.
    const queue_json = queue ? JSON.stringify(originalOrder ? { queue, originalOrder } : { queue }) : undefined;
    await db
      .insertInto("playback_state")
      .values({ user_id, queue_json: queue_json ?? JSON.stringify({ queue: [] }), state_json, updated_at })
      .onConflict((oc) => oc.column("user_id").doUpdateSet({ state_json, updated_at, ...(queue_json ? { queue_json } : {}) }))
      .execute();
    return { updatedAt: updated_at };
  });
}
