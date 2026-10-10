import type { AddonInfo } from "../../shared/api";
import { decrypt } from "../crypto";
import type { Db } from "../db/index";
import type { UserAddon } from "../db/schema";
import type { ActiveAddon, AddonService } from "./service";

export function toAddonInfo(row: UserAddon): AddonInfo {
  return {
    id: row.id,
    baseUrl: row.base_url,
    hasConfig: row.has_config === 1,
    enabled: row.enabled === 1,
    position: row.position,
    manifest: JSON.parse(row.manifest_json),
    manifestFetchedAt: row.manifest_fetched_at,
  };
}

export function listAddonRows(db: Db, userId: string): Promise<UserAddon[]> {
  return db.selectFrom("user_addons").selectAll().where("user_id", "=", userId).orderBy("position").execute();
}

export function toActiveAddon(row: UserAddon, key: Buffer): ActiveAddon {
  return {
    id: row.id,
    url: decrypt(row.url_encrypted, key),
    manifest: JSON.parse(row.manifest_json),
    scope: { hasConfig: row.has_config === 1, baseUrl: row.base_url, urlHash: row.url_hash },
  };
}

/** Writes new positions 0..n-1 in the given order. */
export async function writeOrder(db: Db, userId: string, ids: string[]): Promise<void> {
  await db.transaction().execute(async (trx) => {
    for (const [position, id] of ids.entries()) {
      await trx.updateTable("user_addons").set({ position }).where("id", "=", id).where("user_id", "=", userId).execute();
    }
  });
}

/** Refetches one add-on's manifest and stores it; returns the updated row. */
export async function refreshManifest(
  db: Db,
  service: AddonService,
  row: UserAddon,
  key: Buffer,
  nowIso: string,
): Promise<UserAddon> {
  const manifest = await service.fetchManifest(decrypt(row.url_encrypted, key));
  const update = { manifest_json: JSON.stringify(manifest), manifest_fetched_at: nowIso };
  await db.updateTable("user_addons").set(update).where("id", "=", row.id).execute();
  return { ...row, ...update };
}

const refreshing = new Set<string>();

/**
 * The user's enabled add-ons in order. Manifests older than `manifestTtl`
 * seconds are refetched in the background; the stored one is used meanwhile.
 */
export async function loadActiveAddons(
  db: Db,
  service: AddonService,
  key: Buffer,
  userId: string,
  now: Date,
  manifestTtl: number,
): Promise<ActiveAddon[]> {
  const rows = (await listAddonRows(db, userId)).filter((r) => r.enabled === 1);
  const staleBefore = new Date(now.getTime() - manifestTtl * 1000).toISOString();
  for (const row of rows) {
    if (row.manifest_fetched_at >= staleBefore || refreshing.has(row.id)) continue;
    refreshing.add(row.id);
    refreshManifest(db, service, row, key, now.toISOString())
      .catch(() => undefined)
      .finally(() => refreshing.delete(row.id));
  }
  return rows.map((r) => toActiveAddon(r, key));
}
