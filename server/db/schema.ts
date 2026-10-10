import type { Generated, Insertable, Selectable, Updateable } from "kysely";

// Conventions: ids are text UUIDs, timestamps are ISO 8601 strings (UTC),
// booleans are integers 0/1.

export interface UsersTable {
  id: string;
  username: string;
  /** Lowercased username; unique, used for lookups. */
  username_lower: string;
  display_name: string;
  password_hash: string;
  is_admin: Generated<number>;
  created_at: string;
}

export interface SessionsTable {
  /** SHA-256 (hex) of the session token; the token itself is never stored. */
  id: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  user_agent: string | null;
}

export interface InvitesTable {
  code: string;
  created_by: string | null;
  created_at: string;
  used_by: string | null;
  used_at: string | null;
}

export interface ServerSettingsTable {
  key: string;
  value: string;
}

export interface UserAddonsTable {
  id: string;
  user_id: string;
  /** 0-based order in which the user's add-ons are asked. */
  position: number;
  enabled: number;
  /** The full add-on URL (it may carry credentials), encrypted with the server key. */
  url_encrypted: string;
  /** SHA-256 (hex) of the full URL; identifies the install and keys private cache entries. */
  url_hash: string;
  /** The URL without its config segment; safe to show to the user. */
  base_url: string;
  /** 1 when the URL ends in a config segment; such add-ons never share cache entries. */
  has_config: number;
  manifest_json: string;
  manifest_fetched_at: string;
  created_at: string;
}

export interface CacheEntriesTable {
  key: string;
  value_json: string;
  status: "ok" | "not_found" | "error";
  expires_at: string;
  created_at: string;
}

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  invites: InvitesTable;
  server_settings: ServerSettingsTable;
  user_addons: UserAddonsTable;
  cache_entries: CacheEntriesTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type Session = Selectable<SessionsTable>;
export type Invite = Selectable<InvitesTable>;
export type UserAddon = Selectable<UserAddonsTable>;
