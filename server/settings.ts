import { SIGNUP_MODES, type SignupMode } from "./config";
import type { AppContext } from "./context";
import type { Db } from "./db/index";

export async function getSetting(db: Db, key: string): Promise<string | undefined> {
  const row = await db.selectFrom("server_settings").select("value").where("key", "=", key).executeTakeFirst();
  return row?.value;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  const updated = await db.updateTable("server_settings").set({ value }).where("key", "=", key).executeTakeFirst();
  if (updated.numUpdatedRows === 0n) await db.insertInto("server_settings").values({ key, value }).execute();
}

const BLOCK_PRIVATE_ADDONS = "block_private_addons";

/** Whether add-ons on private network addresses are refused; off unless the admin turns it on. */
export async function getBlockPrivateAddons(db: Db): Promise<boolean> {
  return (await getSetting(db, BLOCK_PRIVATE_ADDONS)) === "true";
}

export async function setBlockPrivateAddons(db: Db, value: boolean): Promise<void> {
  await setSetting(db, BLOCK_PRIVATE_ADDONS, String(value));
}

/** The admin's stored choice if there is one, otherwise FREEBAND_SIGNUP. */
export async function getSignupMode(ctx: AppContext): Promise<SignupMode> {
  const stored = await getSetting(ctx.db, "signup");
  return SIGNUP_MODES.includes(stored as SignupMode) ? (stored as SignupMode) : ctx.config.signup;
}
