import { useEffect, type FormEvent, type ReactNode } from "react";
import { create } from "zustand";
import type { AddonSearchResponse, AlbumSnapshot, ArtistSnapshot, PlaylistSummary, RecentSearch, TrackSnapshot } from "../../shared/api";
import { content, errorMessage, playlists as playlistApi } from "../api/client";
import { useLibrary } from "../store/library";
import { usePlayback } from "../store/playback";
import { albumSnapshot, artistSnapshot, trackSnapshot } from "../snapshots";
import type { AlbumSummary, ArtistSummary, TrackSummary } from "../types";
import { Card, CardGrid, CardRow, Chips, PlayFab } from "./cards";
import { artistNames, Cover, IconButton, Mosaic } from "./common";
import { Icon } from "./icons";
import { useIsPhone } from "./overlays";
import { playAlbumById, playArtistById, playPlaylistById } from "./play";
import { links, navigate, type SearchTab } from "./router";
import { SEARCH_INPUT_ATTR } from "./shortcuts";
import { pickTopResult } from "./topResult";
import { TrackList, type TrackListRow } from "./tracks";

const DEBOUNCE_MS = 350;
const KEEP_RESULTS = 30;
const SEARCH_CONTEXT = { type: "search" } as const;

type Kind = "all" | SearchTab;

interface Entry {
  loading: boolean;
  result?: AddonSearchResponse;
  playlists?: PlaylistSummary[];
  error?: string;
}

interface SearchState {
  query: string;
  /** The query the results are shown for: `query` after a pause in typing. */
  searched: string;
  entries: Record<string, Entry>;
  setQuery(query: string, now?: boolean): void;
  load(kind: Kind, query: string): void;
}

const entryKey = (kind: Kind, query: string) => `${kind}\n${query}`;
const TAB_TYPE = { songs: "track", artists: "artist", albums: "album" } as const;

let timer: ReturnType<typeof setTimeout> | undefined;

/** Kept outside the screens so the query and results survive navigation. */
const useSearch = create<SearchState>()((set, get) => ({
  query: "",
  searched: "",
  entries: {},
  setQuery(query, now) {
    set({ query });
    clearTimeout(timer);
    const apply = () => set({ searched: query.trim() });
    if (now || !query.trim()) apply();
    else timer = setTimeout(apply, DEBOUNCE_MS);
  },
  load(kind, query) {
    const key = entryKey(kind, query);
    const existing = get().entries[key];
    if (existing && !existing.error) return;
    const put = (entry: Entry) => {
      const entries = { ...get().entries, [key]: entry };
      const keys = Object.keys(entries);
      for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_RESULTS))) delete entries[old];
      set({ entries });
    };
    put({ loading: true });
    const addons = kind === "playlists" ? undefined : content.search(query, kind === "all" ? undefined : TAB_TYPE[kind]);
    const lists = kind === "all" || kind === "playlists" ? playlistApi.search(query) : undefined;
    void Promise.allSettled([addons, lists]).then(([a, p]) => {
      const failed = [a, p].find((r) => r.status === "rejected");
      const result = a.status === "fulfilled" ? a.value : undefined;
      const playlists = p.status === "fulfilled" ? p.value?.playlists : undefined;
      // Show what arrived; an error only when nothing did.
      const error = failed && !result && !playlists ? errorMessage(failed.reason) : undefined;
      put({ loading: false, result, playlists, error });
    });
  },
}));

function useEntry(kind: Kind, query: string): Entry | undefined {
  const entry = useSearch((s) => s.entries[entryKey(kind, query)]);
  useEffect(() => {
    if (query) useSearch.getState().load(kind, query);
  }, [kind, query]);
  return entry;
}

const remember = (kind: RecentSearch["kind"], key: string, payload?: unknown) =>
  void useLibrary.getState().addRecentSearch(kind, key, payload).catch(() => {});

const rememberQuery = () => {
  const text = useSearch.getState().query.trim();
  if (text) remember("query", text);
};

/** The search field in the top bar. */
export function SearchInput() {
  const query = useSearch((s) => s.query);
  const phone = useIsPhone();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    useSearch.getState().setQuery(query, true);
    rememberQuery();
  };
  return (
    <form className="search-form" onSubmit={submit} role="search">
      <Icon name="search" />
      <input
        className="search-box"
        type="search"
        placeholder="What do you want to play?"
        value={query}
        onChange={(event) => useSearch.getState().setQuery(event.target.value)}
        autoFocus={!phone}
        aria-label="Search"
        {...{ [SEARCH_INPUT_ATTR]: "" }}
      />
    </form>
  );
}

// Result pieces

function playTrack(track: TrackSummary) {
  remember("track", track.id, trackSnapshot(track));
  usePlayback.getState().playTrack(trackSnapshot(track), SEARCH_CONTEXT);
}

function trackRows(tracks: TrackSummary[]): TrackListRow[] {
  return tracks.map((track, i) => ({ key: `${i}-${track.id}`, track: trackSnapshot(track) }));
}

function SongList({ tracks }: { tracks: TrackSummary[] }) {
  return (
    <TrackList rows={trackRows(tracks)} onPlay={(i) => playTrack(tracks[i])} context={SEARCH_CONTEXT} showCover showAlbum />
  );
}

const ArtistCard = ({ artist }: { artist: ArtistSummary }) => (
  <Card
    round
    href={links.artist(artist.id)}
    cover={<Cover src={artist.image} round />}
    title={artist.name}
    subtitle="Artist"
    onPlay={() => playArtistById(artist.id)}
    onOpen={() => remember("artist", artist.id, artistSnapshot(artist))}
  />
);

const AlbumCard = ({ album }: { album: AlbumSummary }) => (
  <Card
    href={links.album(album.id)}
    cover={<Cover src={album.cover} />}
    title={album.title}
    subtitle={[album.year, artistNames(album.artists)].filter(Boolean).join(" · ")}
    onPlay={() => playAlbumById(album.id)}
    onOpen={() => remember("album", album.id, albumSnapshot(album))}
  />
);

const PlaylistCard = ({ playlist }: { playlist: PlaylistSummary }) => (
  <Card
    href={links.playlist(playlist.id)}
    cover={<Mosaic covers={playlist.covers} />}
    title={playlist.name}
    subtitle={`By ${playlist.owner.displayName}`}
    onPlay={() => playPlaylistById(playlist.id)}
    onOpen={() => remember("playlist", playlist.id, playlist)}
  />
);

function TopResultCard({ query, entry }: { query: string; entry: Entry }) {
  const top = entry.result && pickTopResult(query, entry.result.results, entry.playlists);
  if (!top) return null;
  let href: string;
  let cover;
  let title: string;
  let meta: string;
  let label: string;
  let play: () => void | Promise<void>;
  let open: () => void;
  switch (top.kind) {
    case "artist":
      ({ artist: { name: title } } = top);
      href = links.artist(top.artist.id);
      cover = <Cover src={top.artist.image} round />;
      label = "Artist";
      meta = "";
      play = () => playArtistById(top.artist.id);
      open = () => remember("artist", top.artist.id, artistSnapshot(top.artist));
      break;
    case "track":
      title = top.track.title;
      href = top.track.album ? links.album(top.track.album.id) : links.search;
      cover = <Cover src={top.track.album?.cover} />;
      label = "Song";
      meta = artistNames(top.track.artists);
      play = () => playTrack(top.track);
      open = () => remember("track", top.track.id, trackSnapshot(top.track));
      break;
    case "album":
      title = top.album.title;
      href = links.album(top.album.id);
      cover = <Cover src={top.album.cover} />;
      label = "Album";
      meta = artistNames(top.album.artists);
      play = () => playAlbumById(top.album.id);
      open = () => remember("album", top.album.id, albumSnapshot(top.album));
      break;
    case "playlist":
      title = top.playlist.name;
      href = links.playlist(top.playlist.id);
      cover = <Mosaic covers={top.playlist.covers} />;
      label = "Playlist";
      meta = top.playlist.owner.displayName;
      play = () => playPlaylistById(top.playlist.id);
      open = () => remember("playlist", top.playlist.id, top.playlist);
      break;
  }
  return (
    <section className="top-result-section">
      <h2>Top result</h2>
      <a className={top.kind === "artist" ? "top-result round" : "top-result"} href={href} onClick={open}>
        {cover}
        <span className="top-title">{title}</span>
        <span className="card-subtitle">
          {meta && `${meta} · `}
          <span className="pill">{label}</span>
        </span>
        <PlayFab onPlay={play} large />
      </a>
    </section>
  );
}

function Problems({ entry }: { entry: Entry }) {
  const result = entry.result;
  return (
    <>
      {entry.error && <p className="status error">{entry.error}</p>}
      {result?.asked === 0 && (
        <p className="muted">
          No search add-on installed. <a href={links.addons}>Open Add-ons</a>
        </p>
      )}
      {result?.errors.map((failure) => (
        <p key={failure.addonId} className="status error">
          {failure.name}: {failure.message}
        </p>
      ))}
    </>
  );
}

function isEmpty(entry: Entry) {
  const found = entry.result?.results;
  const count = (found ? found.tracks.length + found.albums.length + found.artists.length : 0) + (entry.playlists?.length ?? 0);
  return !entry.loading && !entry.error && count === 0;
}

function AllResults({ query, entry }: { query: string; entry: Entry }) {
  const found = entry.result?.results;
  return (
    <>
      <div className="search-top">
        <TopResultCard query={query} entry={entry} />
        {found && found.tracks.length > 0 && (
          <section className="search-songs">
            <header className="shelf-head">
              <h2>
                <a href={links.searchTab("songs")}>Songs</a>
              </h2>
              <a className="show-all" href={links.searchTab("songs")}>
                See all
              </a>
            </header>
            <SongList tracks={found.tracks.slice(0, 5)} />
          </section>
        )}
      </div>
      {found && found.artists.length > 0 && (
        <CardRow title="Artists" href={links.searchTab("artists")}>
          {found.artists.slice(0, 10).map((a) => (
            <ArtistCard key={a.id} artist={a} />
          ))}
        </CardRow>
      )}
      {found && found.albums.length > 0 && (
        <CardRow title="Albums" href={links.searchTab("albums")}>
          {found.albums.slice(0, 10).map((a) => (
            <AlbumCard key={a.id} album={a} />
          ))}
        </CardRow>
      )}
      {entry.playlists && entry.playlists.length > 0 && (
        <CardRow title="Playlists" href={links.searchTab("playlists")}>
          {entry.playlists.slice(0, 10).map((p) => (
            <PlaylistCard key={p.id} playlist={p} />
          ))}
        </CardRow>
      )}
    </>
  );
}

function TabResults({ tab, entry }: { tab: SearchTab; entry: Entry }) {
  const found = entry.result?.results;
  switch (tab) {
    case "songs":
      return found ? <SongList tracks={found.tracks} /> : null;
    case "artists":
      return <CardGrid>{found?.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}</CardGrid>;
    case "albums":
      return <CardGrid>{found?.albums.map((a) => <AlbumCard key={a.id} album={a} />)}</CardGrid>;
    case "playlists":
      return <CardGrid>{entry.playlists?.map((p) => <PlaylistCard key={p.id} playlist={p} />)}</CardGrid>;
  }
}

// Recent searches

function recentView(recent: RecentSearch): { title: string; subtitle: string; cover: ReactNode; open(): void } {
  switch (recent.kind) {
    case "track": {
      const track = recent.payload as TrackSnapshot;
      return {
        title: track.title,
        subtitle: `Song · ${artistNames(track.artists)}`,
        cover: <Cover src={track.album?.cover} />,
        open: () => playTrack(track),
      };
    }
    case "album": {
      const album = recent.payload as AlbumSnapshot;
      return {
        title: album.title,
        subtitle: `Album · ${artistNames(album.artists)}`,
        cover: <Cover src={album.cover} />,
        open: () => navigate(links.album(album.id)),
      };
    }
    case "artist": {
      const artist = recent.payload as ArtistSnapshot;
      return {
        title: artist.name,
        subtitle: "Artist",
        cover: <Cover src={artist.image} round />,
        open: () => navigate(links.artist(artist.id)),
      };
    }
    case "playlist": {
      const playlist = recent.payload as PlaylistSummary;
      return {
        title: playlist.name,
        subtitle: `Playlist · ${playlist.owner.displayName}`,
        cover: <Mosaic covers={playlist.covers} />,
        open: () => navigate(links.playlist(playlist.id)),
      };
    }
    default:
      return {
        title: recent.key,
        subtitle: "Search",
        cover: (
          <div className="cover round icon-cover">
            <Icon name="search" />
          </div>
        ),
        open: () => useSearch.getState().setQuery(recent.key, true),
      };
  }
}

function RecentSearches() {
  const recent = useLibrary((s) => s.recentSearches);
  const shown = recent.filter((r) => r.kind === "query" || r.payload);
  if (shown.length === 0) {
    return (
      <div className="empty">
        <h2>Search for music</h2>
        <p className="muted">Find songs, artists, albums and playlists from your add-ons.</p>
      </div>
    );
  }
  const { removeRecentSearch } = useLibrary.getState();
  return (
    <section>
      <header className="shelf-head">
        <h2>Recent searches</h2>
        <button className="link-button muted-link" onClick={() => void removeRecentSearch().catch(() => {})}>
          Clear recent searches
        </button>
      </header>
      <ul className="recent-list">
        {shown.map((r) => {
          const view = recentView(r);
          return (
            <li key={`${r.kind}:${r.key}`}>
              <button className="recent-item" onClick={view.open}>
                <span className="recent-cover">{view.cover}</span>
                <span className="side-item-text">
                  <span className="side-item-title">{view.title}</span>
                  <span className="muted">{view.subtitle}</span>
                </span>
              </button>
              <IconButton icon="remove" label="Remove" onClick={() => void removeRecentSearch(r.kind, r.key).catch(() => {})} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const TABS: { value: Kind; label: string; href: string }[] = [
  { value: "all", label: "All", href: links.search },
  { value: "songs", label: "Songs", href: links.searchTab("songs") },
  { value: "artists", label: "Artists", href: links.searchTab("artists") },
  { value: "albums", label: "Albums", href: links.searchTab("albums") },
  { value: "playlists", label: "Playlists", href: links.searchTab("playlists") },
];

export function SearchScreen({ tab }: { tab?: SearchTab }) {
  const searched = useSearch((s) => s.searched);
  const kind: Kind = tab ?? "all";
  const entry = useEntry(kind, searched);

  if (!searched) {
    return (
      <div className="screen">
        <RecentSearches />
      </div>
    );
  }
  return (
    <div className="screen">
      <Chips options={TABS} value={kind} />
      {entry && <Problems entry={entry} />}
      {(!entry || (entry.loading && !entry.result)) && <p className="muted">Searching…</p>}
      {entry && isEmpty(entry) && <p className="muted">Nothing found for “{searched}”.</p>}
      {entry && (kind === "all" ? <AllResults query={searched} entry={entry} /> : <TabResults tab={kind} entry={entry} />)}
    </div>
  );
}
