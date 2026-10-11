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

export type PlaylistVisibility = "private" | "public";

export interface PlaylistsTable {
  id: string;
  owner_id: string;
  name: string;
  description: Generated<string>;
  visibility: PlaylistVisibility;
  created_at: string;
  updated_at: string;
}

/** Tracks of a playlist; `position` is 0-based and dense (renumbered on every change). */
export interface PlaylistTracksTable {
  id: string;
  playlist_id: string;
  position: number;
  track_id: string;
  album_id: string | null;
  album_cover: string | null;
  duration_ms: number | null;
  /** The TrackSnapshot as JSON. */
  snapshot_json: string;
  added_at: string;
  added_by: string | null;
}

export interface PlaylistFollowsTable {
  user_id: string;
  playlist_id: string;
  created_at: string;
}

export interface LikesTable {
  user_id: string;
  track_id: string;
  snapshot_json: string;
  created_at: string;
}

export interface SavedAlbumsTable {
  user_id: string;
  album_id: string;
  snapshot_json: string;
  created_at: string;
}

export interface FollowedArtistsTable {
  user_id: string;
  artist_id: string;
  snapshot_json: string;
  created_at: string;
}

export type PlayContextType = "album" | "playlist" | "artist" | "search" | "queue";

export interface PlaysTable {
  id: string;
  user_id: string;
  track_id: string;
  /** The track's main (first) artist; top artists count it only. */
  artist_id: string;
  artist_name: string;
  album_id: string | null;
  snapshot_json: string;
  played_at: string;
  ms_played: number;
  context_type: PlayContextType;
  context_id: string | null;
  context_name: string | null;
  context_image: string | null;
}

export interface RecentSearchesTable {
  user_id: string;
  kind: "query" | "track" | "album" | "artist" | "playlist";
  key: string;
  payload_json: string;
  created_at: string;
}

export interface UserSettingsTable {
  user_id: string;
  settings_json: string;
  updated_at: string;
}

/** The queue is kept apart from the small, often-written state. */
export interface PlaybackStateTable {
  user_id: string;
  /** `{ queue, originalOrder }` */
  queue_json: string;
  /** Index, position, shuffle, repeat, volume and context. */
  state_json: string;
  updated_at: string;
}

/** A short-lived link to one stream of one user; the add-on's play URL never reaches the browser. */
export interface PlayLinksTable {
  /** SHA-256 (hex) of the token. */
  token_hash: string;
  /** SHA-256 (hex) of user, add-on and play URL; finds a link to reuse. */
  stream_key: string;
  user_id: string;
  addon_id: string;
  /** The token, encrypted with the server key, so the same link can be handed out again. */
  token_encrypted: string;
  /** The add-on's play URL, encrypted with the server key. */
  url_encrypted: string;
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
  playlists: PlaylistsTable;
  playlist_tracks: PlaylistTracksTable;
  playlist_follows: PlaylistFollowsTable;
  likes: LikesTable;
  saved_albums: SavedAlbumsTable;
  followed_artists: FollowedArtistsTable;
  plays: PlaysTable;
  recent_searches: RecentSearchesTable;
  user_settings: UserSettingsTable;
  playback_state: PlaybackStateTable;
  play_links: PlayLinksTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type Session = Selectable<SessionsTable>;
export type Invite = Selectable<InvitesTable>;
export type UserAddon = Selectable<UserAddonsTable>;
export type Playlist = Selectable<PlaylistsTable>;
export type PlaylistTrack = Selectable<PlaylistTracksTable>;
