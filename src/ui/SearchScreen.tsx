import { useEffect } from "react";
import { create } from "zustand";
import type { SearchResult } from "../addons/client";
import { addonClient } from "../store/addons";
import { usePlayback } from "../store/playback";
import { artistNames, Cover, IconButton, TrackRow } from "./common";
import { links } from "./router";

const DEBOUNCE_MS = 400;

interface SearchState {
  query: string;
  /** The query the shown result belongs to. */
  searched: string;
  loading: boolean;
  result: SearchResult | null;
  setQuery(query: string): void;
  run(query: string): Promise<void>;
}

/** Kept outside the component so results survive a visit to another screen. */
const useSearch = create<SearchState>()((set, get) => ({
  query: "",
  searched: "",
  loading: false,
  result: null,
  setQuery: (query) => set({ query }),
  async run(query) {
    if (!query) {
      set({ searched: "", result: null, loading: false });
      return;
    }
    set({ loading: true });
    const result = await addonClient.search(query);
    if (get().query.trim() === query) set({ searched: query, result, loading: false });
  },
}));

export function SearchScreen() {
  const { query, searched, loading, result, setQuery, run } = useSearch();
  const playTrack = usePlayback((s) => s.playTrack);
  const addTrack = usePlayback((s) => s.addTrack);

  useEffect(() => {
    const wanted = query.trim();
    if (wanted === searched) return;
    const timer = setTimeout(() => void run(wanted), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, searched, run]);

  const found = result?.results;
  const empty = found && found.tracks.length + found.albums.length + found.artists.length === 0;

  return (
    <div className="screen">
      <input
        className="search-box"
        type="search"
        placeholder="Search tracks, albums and artists"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
      />
      {loading && <p className="muted">Searching…</p>}
      {result?.asked === 0 && (
        <p className="muted">
          No search add-on installed. <a href={links.addons}>Open Add-ons</a>
        </p>
      )}
      {result?.errors.map((failure) => (
        <p key={failure.addon.baseUrl} className="status error">
          {failure.addon.manifest.name}: {failure.message}
        </p>
      ))}
      {empty && result.asked > 0 && result.errors.length < result.asked && (
        <p className="muted">Nothing found for “{searched}”.</p>
      )}

      {found && found.tracks.length > 0 && (
        <section>
          <h2>Tracks</h2>
          <ul className="tracks">
            {found.tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                lead={<Cover src={track.album?.cover} />}
                showAlbum
                onPlay={() => playTrack(track)}
                actions={<IconButton icon="add" label="Add to queue" onClick={() => addTrack(track)} />}
              />
            ))}
          </ul>
        </section>
      )}
      {found && found.albums.length > 0 && (
        <section>
          <h2>Albums</h2>
          <div className="grid">
            {found.albums.map((album) => (
              <a key={album.id} className="card" href={links.album(album.id)}>
                <Cover src={album.cover} />
                <span className="card-title">{album.title}</span>
                <span className="muted">
                  {[album.year, artistNames(album.artists)].filter(Boolean).join(" · ")}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
      {found && found.artists.length > 0 && (
        <section>
          <h2>Artists</h2>
          <div className="grid">
            {found.artists.map((artist) => (
              <a key={artist.id} className="card" href={links.artist(artist.id)}>
                <Cover src={artist.image} round />
                <span className="card-title">{artist.name}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
