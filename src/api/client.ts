// The only module that talks to the network: typed calls to the server's `/api`.

import {
  CSRF_HEADER,
  CSRF_VALUE,
  type AddonResponse,
  type AddonSearchResponse,
  type AddonsResponse,
  type AddPlaylistTracksRequest,
  type AddRecentSearchRequest,
  type Album,
  type AlbumSnapshot,
  type Artist,
  type ArtistSnapshot,
  type AuthConfigResponse,
  type CreatePlaylistRequest,
  type FollowedArtistsResponse,
  type InviteResponse,
  type InvitesResponse,
  type LibraryResponse,
  type LikeLookupResponse,
  type LikesResponse,
  type LoginRequest,
  type MeResponse,
  type PlaybackResponse,
  type PlaybackSavedResponse,
  type PlaybackUpdate,
  type PlaylistResponse,
  type PlaylistSearchResponse,
  type PlaylistsResponse,
  type PrefetchMetaRequest,
  type PrefetchRequest,
  type PrefetchResponse,
  type ProfileResponse,
  type RecentResponse,
  type RecentSearchesResponse,
  type RecentSearchKind,
  type RecordPlayRequest,
  type SavedAlbumsResponse,
  type SearchType,
  type ServerSettings,
  type ServerSettingsUpdate,
  type SessionsResponse,
  type SettingsResponse,
  type SignupRequest,
  type StatsRange,
  type StatsResponse,
  type StreamResolveRequest,
  type StreamResolveResponse,
  type Track,
  type TrackSnapshot,
  type UpdatePlaylistRequest,
  type UserSettings,
  type UsersResponse,
} from "../../shared/api";

const BASE = "/api";

/** A failed API request; `code` comes from the server's error body, or is "network". */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};

/** Called when a request outside `auth/` answers 401: the session has ended. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Options {
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Lets the request outlive the page (for saving state on `pagehide`). */
  keepalive?: boolean;
}

async function request<T>(method: Method, path: string, options: Options = {}): Promise<T> {
  let url = BASE + path;
  if (options.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) if (value !== undefined) params.set(key, value);
    const text = params.toString();
    if (text) url += `?${text}`;
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") headers[CSRF_HEADER] = CSRF_VALUE;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: "same-origin",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      keepalive: options.keepalive,
    });
  } catch {
    throw new ApiError(0, "network", "Could not reach the server.");
  }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) onUnauthorized();
    const error = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
    throw new ApiError(
      response.status,
      typeof error?.code === "string" ? error.code : "http",
      typeof error?.message === "string" ? error.message : `The server answered with HTTP ${response.status}.`,
    );
  }
  return body as T;
}

const get = <T>(path: string, query?: Options["query"]) => request<T>("GET", path, { query });
const send = <T>(method: Exclude<Method, "GET">, path: string, body?: unknown, extra?: Omit<Options, "body">) =>
  request<T>(method, path, { ...extra, body });
const id = encodeURIComponent;

export const auth = {
  config: () => get<AuthConfigResponse>("/auth/config"),
  me: () => get<MeResponse>("/auth/me"),
  login: (body: LoginRequest) => send<MeResponse>("POST", "/auth/login", body),
  signup: (body: SignupRequest) => send<MeResponse>("POST", "/auth/signup", body),
  logout: () => send<void>("POST", "/auth/logout"),
};

export const account = {
  changePassword: (current: string, next: string) =>
    send<void>("POST", "/account/password", { current, new: next }),
  sessions: () => get<SessionsResponse>("/account/sessions"),
  revokeSession: (sessionId: string) => send<void>("DELETE", `/account/sessions/${id(sessionId)}`),
  updateProfile: (displayName: string) => send<MeResponse>("PATCH", "/account/profile", { displayName }),
};

export const admin = {
  users: () => get<UsersResponse>("/admin/users"),
  deleteUser: (userId: string) => send<void>("DELETE", `/admin/users/${id(userId)}`),
  setPassword: (userId: string, password: string) =>
    send<void>("POST", `/admin/users/${id(userId)}/password`, { password }),
  settings: () => get<ServerSettings>("/admin/settings"),
  updateSettings: (settings: ServerSettingsUpdate) => send<ServerSettings>("PUT", "/admin/settings", settings),
  clearCache: () => send<void>("POST", "/admin/cache/clear"),
  invites: () => get<InvitesResponse>("/admin/invites"),
  createInvite: () => send<InviteResponse>("POST", "/admin/invites"),
  deleteInvite: (code: string) => send<void>("DELETE", `/admin/invites/${id(code)}`),
};

export const addons = {
  list: () => get<AddonsResponse>("/addons"),
  install: (url: string) => send<AddonResponse>("POST", "/addons", { url }),
  update: (addonId: string, patch: { enabled?: boolean; position?: number }) =>
    send<AddonResponse>("PATCH", `/addons/${id(addonId)}`, patch),
  reorder: (ids: string[]) => send<AddonsResponse>("PUT", "/addons/order", { ids }),
  remove: (addonId: string) => send<void>("DELETE", `/addons/${id(addonId)}`),
  refresh: () => send<AddonsResponse>("POST", "/addons/refresh"),
};

/** Requests passed on to the user's add-ons, through the server's cache. */
export const content = {
  search: (q: string, type?: SearchType) => get<AddonSearchResponse>("/search", { q, type }),
  artist: (artistId: string) => get<Artist>(`/meta/artist/${id(artistId)}`),
  album: (albumId: string) => get<Album>(`/meta/album/${id(albumId)}`),
  track: (trackId: string) => get<Track>(`/meta/track/${id(trackId)}`),
  stream: (body: StreamResolveRequest) => send<StreamResolveResponse>("POST", "/stream", body),
  prefetch: (body: PrefetchRequest) => send<PrefetchResponse>("POST", "/prefetch", body),
  prefetchMeta: (body: PrefetchMetaRequest) => send<PrefetchResponse>("POST", "/prefetch/meta", body),
};

export const playlists = {
  list: () => get<PlaylistsResponse>("/playlists"),
  get: (playlistId: string) => get<PlaylistResponse>(`/playlists/${id(playlistId)}`),
  create: (body: CreatePlaylistRequest) => send<PlaylistResponse>("POST", "/playlists", body),
  update: (playlistId: string, body: UpdatePlaylistRequest) =>
    send<PlaylistResponse>("PATCH", `/playlists/${id(playlistId)}`, body),
  remove: (playlistId: string) => send<void>("DELETE", `/playlists/${id(playlistId)}`),
  addTracks: (playlistId: string, body: AddPlaylistTracksRequest) =>
    send<PlaylistResponse>("POST", `/playlists/${id(playlistId)}/tracks`, body),
  removeTracks: (playlistId: string, entryIds: string[]) =>
    send<PlaylistResponse>("DELETE", `/playlists/${id(playlistId)}/tracks`, { entryIds }),
  moveTracks: (playlistId: string, entryIds: string[], beforeEntryId: string | null) =>
    send<PlaylistResponse>("POST", `/playlists/${id(playlistId)}/tracks/move`, { entryIds, beforeEntryId }),
  follow: (playlistId: string) => send<PlaylistResponse>("PUT", `/playlists/${id(playlistId)}/follow`),
  unfollow: (playlistId: string) => send<void>("DELETE", `/playlists/${id(playlistId)}/follow`),
  search: (q: string) => get<PlaylistSearchResponse>("/search/playlists", { q }),
};

export const library = {
  overview: () => get<LibraryResponse>("/library"),
  likes: () => get<LikesResponse>("/library/likes"),
  lookupLikes: (trackIds: string[]) => send<LikeLookupResponse>("POST", "/library/likes/lookup", { trackIds }),
  like: (track: TrackSnapshot) => send<void>("PUT", `/library/likes/${id(track.id)}`, { track }),
  unlike: (trackId: string) => send<void>("DELETE", `/library/likes/${id(trackId)}`),
  albums: () => get<SavedAlbumsResponse>("/library/albums"),
  saveAlbum: (album: AlbumSnapshot) => send<void>("PUT", `/library/albums/${id(album.id)}`, { album }),
  unsaveAlbum: (albumId: string) => send<void>("DELETE", `/library/albums/${id(albumId)}`),
  artists: () => get<FollowedArtistsResponse>("/library/artists"),
  followArtist: (artist: ArtistSnapshot) => send<void>("PUT", `/library/artists/${id(artist.id)}`, { artist }),
  unfollowArtist: (artistId: string) => send<void>("DELETE", `/library/artists/${id(artistId)}`),
  recentSearches: () => get<RecentSearchesResponse>("/library/recent-searches"),
  addRecentSearch: (body: AddRecentSearchRequest) => send<void>("POST", "/library/recent-searches", body),
  /** Removes one recent search, or all of them without arguments. */
  removeRecentSearch: (kind?: RecentSearchKind, key?: string) =>
    request<void>("DELETE", "/library/recent-searches", { query: { kind, key } }),
};

export const history = {
  recordPlay: (body: RecordPlayRequest) => send<void>("POST", "/history/plays", body),
  recent: () => get<RecentResponse>("/history/recent"),
  stats: (range?: StatsRange) => get<StatsResponse>("/stats", { range }),
};

export const me = {
  settings: () => get<SettingsResponse>("/me/settings"),
  saveSettings: (settings: UserSettings) => send<SettingsResponse>("PUT", "/me/settings", { settings }),
  playback: () => get<PlaybackResponse>("/me/playback"),
  savePlayback: (state: PlaybackUpdate, keepalive?: boolean) =>
    send<PlaybackSavedResponse>("PUT", "/me/playback", state, { keepalive }),
};

export const users = {
  profile: (username: string) => get<ProfileResponse>(`/users/${id(username)}`),
};

/** A readable message for any thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
