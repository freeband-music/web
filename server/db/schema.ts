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

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  invites: InvitesTable;
  server_settings: ServerSettingsTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type Session = Selectable<SessionsTable>;
export type Invite = Selectable<InvitesTable>;
