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

// Library. Tracks, albums and artists are stored as snapshots: enough to
// show them and to request streams without asking their metadata add-on.

/** A track as stored in playlists, likes, history and the synced queue. */
export type TrackSnapshot = TrackSummary & {
  /** Base URL of the metadata add-on the track came from, when known. */
  addonBaseUrl?: string;
};

/** An album as stored in the library (the protocol's album summary). */
export type AlbumSnapshot = AlbumSummary & { addonBaseUrl?: string };

/** An artist as stored in the library (the protocol's artist summary). */
export type ArtistSnapshot = ArtistSummary & { addonBaseUrl?: string };

export type PlaylistVisibility = "private" | "public";

/** A user as others see them. */
export interface PublicUser {
  username: string;
  displayName: string;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  description: string;
  visibility: PlaylistVisibility;
  owner: PublicUser;
  /** The signed-in user owns this playlist. */
  isOwner: boolean;
  /** The signed-in user follows this playlist. */
  followed: boolean;
  trackCount: number;
  /** Sum of the known track durations. */
  durationMs: number;
  /** Up to 4 distinct album covers, in playlist order, for a mosaic. */
  covers: string[];
  createdAt: string;
  updatedAt: string;
  /** When the signed-in user followed it (followed playlists only). */
  followedAt?: string;
}

/** One track in a playlist. The same track may appear several times, each with its own entry ID. */
export interface PlaylistEntry {
  entryId: string;
  track: TrackSnapshot;
  addedAt: string;
}

/** `GET playlists`: the user's own playlists, then followed ones. */
export interface PlaylistsResponse {
  playlists: PlaylistSummary[];
}

/** `GET playlists/:id`, and the answer to every playlist change. */
export interface PlaylistResponse {
  playlist: PlaylistSummary;
  tracks: PlaylistEntry[];
}

export interface CreatePlaylistRequest {
  name: string;
  description?: string;
  /** Default "private". */
  visibility?: PlaylistVisibility;
  /** Initial tracks, for example "save queue as playlist". */
  tracks?: TrackSnapshot[];
}

export interface UpdatePlaylistRequest {
  name?: string;
  description?: string;
  visibility?: PlaylistVisibility;
}

/** `POST playlists/:id/tracks`. Duplicates are allowed. */
export interface AddPlaylistTracksRequest {
  tracks: TrackSnapshot[];
  /** 0-based index to insert at; default the end. */
  position?: number;
}

/** `DELETE playlists/:id/tracks`. */
export interface RemovePlaylistTracksRequest {
  entryIds: string[];
}

/**
 * `POST playlists/:id/tracks/move`: moves the entries, keeping their
 * relative order, to just before `beforeEntryId` (null: to the end).
 */
export interface MovePlaylistTracksRequest {
  entryIds: string[];
  beforeEntryId: string | null;
}

export interface LikedTrack {
  track: TrackSnapshot;
  likedAt: string;
}

/** `GET library/likes`, newest first. */
export interface LikesResponse {
  tracks: LikedTrack[];
}

/** `PUT library/likes/:trackId`; `track.id` must equal the path's ID. */
export interface LikeRequest {
  track: TrackSnapshot;
}

/** `POST library/likes/lookup`: which of these tracks are liked (for heart icons in lists). */
export interface LikeLookupRequest {
  trackIds: string[];
}

export interface LikeLookupResponse {
  liked: string[];
}

export interface SavedAlbum {
  album: AlbumSnapshot;
  savedAt: string;
}

/** `GET library/albums`, newest first. */
export interface SavedAlbumsResponse {
  albums: SavedAlbum[];
}

/** `PUT library/albums/:albumId`. */
export interface SaveAlbumRequest {
  album: AlbumSnapshot;
}

export interface FollowedArtist {
  artist: ArtistSnapshot;
  followedAt: string;
}

/** `GET library/artists`, newest first. */
export interface FollowedArtistsResponse {
  artists: FollowedArtist[];
}

/** `PUT library/artists/:artistId`. */
export interface FollowArtistRequest {
  artist: ArtistSnapshot;
}

/** `GET library`: everything the Library screen shows; sorting and filtering happen in the client. */
export interface LibraryResponse {
  playlists: PlaylistSummary[];
  followedPlaylists: PlaylistSummary[];
  albums: SavedAlbum[];
  artists: FollowedArtist[];
  likedCount: number;
}

// Play history and stats.

export type PlayContextType = "album" | "playlist" | "artist" | "search" | "queue";

/** Where a track was played from. */
export interface PlayContext {
  type: PlayContextType;
  /** Album, playlist or artist ID (absent for search and queue). */
  id?: string;
  name?: string;
  /** Album cover or artist image, for "recently played" cards. */
  image?: string;
}

/**
 * The client records a play once the track has played for this long, or
 * when it finishes, whichever comes first; once per play-through.
 */
export const PLAY_THRESHOLD_MS = 30_000;

/** `POST history/plays`. */
export interface RecordPlayRequest {
  track: TrackSnapshot;
  msPlayed: number;
  /** Default: now. Lets a client send plays it could not send earlier. */
  playedAt?: string;
  /** Default `{ type: "queue" }`. */
  context?: PlayContext;
}

/** A recently played album, playlist or artist; one per context, newest first. */
export interface RecentContext {
  type: "album" | "playlist" | "artist";
  id: string;
  name: string;
  image?: string;
  /** Playlists: their mosaic covers. */
  covers?: string[];
  lastPlayedAt: string;
}

/** `GET history/recent`: for the home screen's quick-access grid and "recently played". */
export interface RecentResponse {
  contexts: RecentContext[];
}

export type StatsRange = "4w" | "6m" | "all";

export interface TrackStat {
  track: TrackSnapshot;
  plays: number;
}

/** Artists count each play of a track by its main (first) artist. */
export interface ArtistStat {
  artist: ArtistSummary;
  plays: number;
}

/** `GET stats?range=4w|6m|all` (default 4w). */
export interface StatsResponse {
  range: StatsRange;
  /** Start of the range; null for all time. */
  since: string | null;
  totalPlays: number;
  totalMinutes: number;
  topTracks: TrackStat[];
  topArtists: ArtistStat[];
}

// Recent searches, settings and playback sync.

export type RecentSearchKind = "query" | "track" | "album" | "artist" | "playlist";

/** One of the user's last 10 searches or opened results; the same kind and key appear once. */
export interface RecentSearch {
  kind: RecentSearchKind;
  /** The query text, or the item's ID. */
  key: string;
  /** What the client needs to show it (a snapshot or a playlist summary); null for queries. */
  payload: unknown;
  createdAt: string;
}

/** `GET library/recent-searches`, newest first. */
export interface RecentSearchesResponse {
  searches: RecentSearch[];
}

/** `POST library/recent-searches`. `DELETE library/recent-searches?kind=&key=` removes one; without them, all. */
export interface AddRecentSearchRequest {
  kind: RecentSearchKind;
  key: string;
  payload?: unknown;
}

/** Client settings, stored as given (at most 64 KiB of JSON). */
export type UserSettings = Record<string, unknown>;

/** `GET` and `PUT me/settings` (PUT replaces them). */
export interface SettingsResponse {
  settings: UserSettings;
  updatedAt: string | null;
}

export type RepeatMode = "off" | "all" | "one";

export interface PlaybackState {
  /** At most 1000 tracks, in play order. */
  queue: TrackSnapshot[];
  /** With shuffle on: the queue's indexes in their unshuffled order. */
  originalOrder?: number[];
  index: number;
  positionMs: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** 0 to 1. */
  volume: number;
  muted: boolean;
  context?: PlayContext;
}

/**
 * `PUT me/playback`. Sent often, so `queue` and `originalOrder` may be
 * left out to keep the stored queue; send them whenever the queue changes.
 */
export type PlaybackUpdate = Omit<PlaybackState, "queue" | "originalOrder"> &
  Partial<Pick<PlaybackState, "queue" | "originalOrder">>;

/** `GET me/playback`; null before the first PUT. */
export interface PlaybackResponse {
  playback: PlaybackState | null;
  updatedAt: string | null;
}

/** Answer to `PUT me/playback`. */
export interface PlaybackSavedResponse {
  updatedAt: string;
}
