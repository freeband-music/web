import { create } from "zustand";
import type {
  AlbumSnapshot,
  ArtistSnapshot,
  CreatePlaylistRequest,
  FollowedArtist,
  PlaylistResponse,
  PlaylistSummary,
  RecentSearch,
  RecentSearchKind,
  SavedAlbum,
  TrackSnapshot,
  UpdatePlaylistRequest,
} from "../../shared/api";
import { library as api, playlists as playlistApi } from "../api/client";

interface LibraryState {
  loaded: boolean;
  /** The user's own playlists. */
  playlists: PlaylistSummary[];
  followedPlaylists: PlaylistSummary[];
  albums: SavedAlbum[];
  artists: FollowedArtist[];
  likedCount: number;
  /** Known like state per track ID; tracks not looked up yet are absent. */
  liked: Record<string, boolean>;
  recentSearches: RecentSearch[];

  load(): Promise<void>;
  reset(): void;

  /** Looks up the like state of tracks not known yet (for heart icons in a list). */
  lookupLikes(trackIds: string[]): Promise<void>;
  setLiked(track: TrackSnapshot, liked: boolean): Promise<void>;
  isAlbumSaved(albumId: string): boolean;
  setAlbumSaved(album: AlbumSnapshot, saved: boolean): Promise<void>;
  isArtistFollowed(artistId: string): boolean;
  setArtistFollowed(artist: ArtistSnapshot, followed: boolean): Promise<void>;

  createPlaylist(request: CreatePlaylistRequest): Promise<PlaylistResponse>;
  updatePlaylist(id: string, patch: UpdatePlaylistRequest): Promise<PlaylistResponse>;
  deletePlaylist(id: string): Promise<void>;
  addToPlaylist(id: string, tracks: TrackSnapshot[], position?: number): Promise<PlaylistResponse>;
  removeFromPlaylist(id: string, entryIds: string[]): Promise<PlaylistResponse>;
  moveInPlaylist(id: string, entryIds: string[], beforeEntryId: string | null): Promise<PlaylistResponse>;
  setPlaylistFollowed(playlist: PlaylistSummary, followed: boolean): Promise<void>;

  addRecentSearch(kind: RecentSearchKind, key: string, payload?: unknown): Promise<void>;
  /** Removes one recent search, or all without arguments. */
  removeRecentSearch(kind?: RecentSearchKind, key?: string): Promise<void>;
}

const empty = {
  loaded: false,
  playlists: [],
  followedPlaylists: [],
  albums: [],
  artists: [],
  likedCount: 0,
  liked: {},
  recentSearches: [],
};

/** Playlists, likes, saved albums, followed artists and recent searches, stored on the server. */
export const useLibrary = create<LibraryState>()((set, get) => {
  /** Puts a changed playlist's summary in place in the lists. */
  function updated(response: PlaylistResponse): PlaylistResponse {
    const summary = response.playlist;
    const swap = (list: PlaylistSummary[]) => list.map((p) => (p.id === summary.id ? summary : p));
    const own = get().playlists;
    set({
      playlists: own.some((p) => p.id === summary.id) || !summary.isOwner ? swap(own) : [summary, ...own],
      followedPlaylists: swap(get().followedPlaylists),
    });
    return response;
  }

  /** Applies a change at once and undoes it if the request fails. */
  async function optimistic(change: Partial<LibraryState>, request: () => Promise<unknown>) {
    const before = Object.fromEntries(Object.keys(change).map((k) => [k, get()[k as keyof LibraryState]]));
    set(change);
    try {
      await request();
    } catch (error) {
      set(before);
      throw error;
    }
  }

  return {
    ...empty,

    async load() {
      const [overview, recent] = await Promise.all([api.overview(), api.recentSearches()]);
      set({
        loaded: true,
        playlists: overview.playlists,
        followedPlaylists: overview.followedPlaylists,
        albums: overview.albums,
        artists: overview.artists,
        likedCount: overview.likedCount,
        recentSearches: recent.searches,
      });
    },
    reset: () => set(empty),

    async lookupLikes(trackIds) {
      const known = get().liked;
      const wanted = [...new Set(trackIds)].filter((id) => !(id in known));
      if (wanted.length === 0) return;
      const { liked } = await api.lookupLikes(wanted);
      const yes = new Set(liked);
      set({ liked: { ...get().liked, ...Object.fromEntries(wanted.map((id) => [id, yes.has(id)])) } });
    },
    async setLiked(track, liked) {
      const was = get().liked[track.id] === true;
      if (was === liked) return;
      await optimistic(
        { liked: { ...get().liked, [track.id]: liked }, likedCount: get().likedCount + (liked ? 1 : -1) },
        () => (liked ? api.like(track) : api.unlike(track.id)),
      );
    },

    isAlbumSaved: (albumId) => get().albums.some((a) => a.album.id === albumId),
    async setAlbumSaved(album, saved) {
      const rest = get().albums.filter((a) => a.album.id !== album.id);
      await optimistic(
        { albums: saved ? [{ album, savedAt: new Date().toISOString() }, ...rest] : rest },
        () => (saved ? api.saveAlbum(album) : api.unsaveAlbum(album.id)),
      );
    },

    isArtistFollowed: (artistId) => get().artists.some((a) => a.artist.id === artistId),
    async setArtistFollowed(artist, followed) {
      const rest = get().artists.filter((a) => a.artist.id !== artist.id);
      await optimistic(
        { artists: followed ? [{ artist, followedAt: new Date().toISOString() }, ...rest] : rest },
        () => (followed ? api.followArtist(artist) : api.unfollowArtist(artist.id)),
      );
    },

    createPlaylist: async (request) => updated(await playlistApi.create(request)),
    updatePlaylist: async (id, patch) => updated(await playlistApi.update(id, patch)),
    async deletePlaylist(id) {
      await playlistApi.remove(id);
      set({ playlists: get().playlists.filter((p) => p.id !== id) });
    },
    addToPlaylist: async (id, tracks, position) => updated(await playlistApi.addTracks(id, { tracks, position })),
    removeFromPlaylist: async (id, entryIds) => updated(await playlistApi.removeTracks(id, entryIds)),
    moveInPlaylist: async (id, entryIds, before) => updated(await playlistApi.moveTracks(id, entryIds, before)),
    async setPlaylistFollowed(playlist, followed) {
      const rest = get().followedPlaylists.filter((p) => p.id !== playlist.id);
      await optimistic({ followedPlaylists: followed ? [{ ...playlist, followed: true }, ...rest] : rest }, () =>
        followed ? playlistApi.follow(playlist.id) : playlistApi.unfollow(playlist.id),
      );
    },

    async addRecentSearch(kind, key, payload) {
      const rest = get().recentSearches.filter((s) => s.kind !== kind || s.key !== key);
      const entry: RecentSearch = { kind, key, payload: payload ?? null, createdAt: new Date().toISOString() };
      await optimistic({ recentSearches: [entry, ...rest].slice(0, 10) }, () =>
        api.addRecentSearch({ kind, key, payload }),
      );
    },
    async removeRecentSearch(kind, key) {
      const keep = kind === undefined ? [] : get().recentSearches.filter((s) => s.kind !== kind || s.key !== key);
      await optimistic({ recentSearches: keep }, () => api.removeRecentSearch(kind, key));
    },
  };
});
