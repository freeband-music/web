// Request and response types of the Freeband server HTTP API (`/api`).
// Shared by the client and the server.

import type { components } from "../src/protocol/schema.gen";

type Schemas = components["schemas"];

// Add-on protocol types, passed through unchanged.
export type Manifest = Schemas["Manifest"];
export type ArtistSummary = Schemas["ArtistSummary"];
export type AlbumSummary = Schemas["AlbumSummary"];
export type TrackSummary = Schemas["TrackSummary"];
export type Artist = Schemas["Artist"];
export type Album = Schemas["Album"];
export type Track = Schemas["Track"];
export type SearchResponse = Schemas["SearchResponse"];
export type Stream = Schemas["Stream"];
export type StreamResponse = Schemas["StreamResponse"];

export type SignupMode = "open" | "invite" | "closed";

/** Every error response has this shape. */
export interface ApiError {
  error: { code: string; message: string };
}

/** Mutating requests must send this header (or a JSON body). */
export const CSRF_HEADER = "X-Requested-With";
export const CSRF_VALUE = "freeband";

export interface UserInfo {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface SignupRequest {
  username: string;
  password: string;
  displayName?: string;
  invite?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

/** Response of signup, login and `GET auth/me`. */
export interface MeResponse {
  user: UserInfo;
}

export interface AuthConfigResponse {
  signup: SignupMode;
  hasUsers: boolean;
}

export interface ChangePasswordRequest {
  current: string;
  new: string;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  current: boolean;
}

export interface SessionsResponse {
  sessions: SessionInfo[];
}

export interface UpdateProfileRequest {
  displayName: string;
}

export interface UsersResponse {
  users: UserInfo[];
}

export interface AdminSetPasswordRequest {
  password: string;
}

export interface ServerSettings {
  signup: SignupMode;
}

export interface InviteInfo {
  code: string;
  createdBy: string | null;
  createdAt: string;
  usedBy: string | null;
  usedAt: string | null;
}

export interface InvitesResponse {
  invites: InviteInfo[];
}

export interface InviteResponse {
  invite: InviteInfo;
}

// Add-ons. The full add-on URL is never sent back: it may carry credentials.

export interface AddonInfo {
  id: string;
  /** The add-on URL without its config segment. */
  baseUrl: string;
  /** The installed URL carries configuration; its responses are cached for this user only. */
  hasConfig: boolean;
  enabled: boolean;
  /** 0-based; add-ons are asked in this order. */
  position: number;
  manifest: Manifest;
  manifestFetchedAt: string;
}

/** An add-on that failed during a request that asked several. */
export interface AddonFailure {
  addonId: string;
  name: string;
  message: string;
}

export interface InstallAddonRequest {
  /** Add-on URL or manifest URL, optionally with a config segment. */
  url: string;
}

export interface UpdateAddonRequest {
  enabled?: boolean;
  /** Moves the add-on to this 0-based position. */
  position?: number;
}

/** Every installed add-on ID, in the new order. */
export interface ReorderAddonsRequest {
  ids: string[];
}

export interface AddonResponse {
  addon: AddonInfo;
}

/** `GET addons`, `PUT addons/order`, `POST addons/refresh` (with `errors` for manifests that failed). */
export interface AddonsResponse {
  addons: AddonInfo[];
  errors?: AddonFailure[];
}

// Proxied add-on requests. `GET meta/{artist,album,track}/:id` answer with
// the protocol's Artist, Album or Track.

export type SearchType = "track" | "album" | "artist";

/** `GET search?q=&type=`: results merged across metadata add-ons, first add-on wins on duplicate IDs. */
export interface AddonSearchResponse {
  results: SearchResponse;
  errors: AddonFailure[];
  /** Number of add-ons asked. */
  asked: number;
}

export interface StreamResolveRequest {
  track: TrackSummary;
  /**
   * Whether a stream add-on may be asked, which can make it queue a download
   * (default true). With false only cached results are returned.
   */
  allowQueue?: boolean;
}

/** Outcome of asking the stream add-ons, in add-on order. Streams are not re-sorted. */
export type StreamResult =
  | { kind: "ok"; streams: Stream[] }
  | { kind: "queued"; message?: string }
  | { kind: "not_found" }
  /** `allowQueue: false` and nothing cached yet. */
  | { kind: "not_cached" }
  | { kind: "no_addon" }
  | { kind: "error"; message: string };

export interface StreamResolveResponse {
  result: StreamResult;
  /** Answered entirely from the server cache. */
  cached: boolean;
}

/**
 * `POST prefetch`: resolve streams ahead of playback. `tracks` is the queue;
 * tracks after `current` are prefetched (all of them when `current` is
 * omitted). A new request replaces the user's previous one.
 */
export interface PrefetchRequest {
  tracks: TrackSummary[];
  current?: number;
}

/** `POST prefetch/meta`: warm metadata, for example when a playlist opens. */
export interface PrefetchMetaRequest {
  albumIds?: string[];
  trackIds?: string[];
}

/** Both prefetch endpoints answer 202 at once; the work continues in the background. */
export interface PrefetchResponse {
  /** Lookups started (cached items are skipped). */
  planned: number;
}
