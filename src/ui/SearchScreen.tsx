import { useEffect, type FormEvent } from "react";
import { create } from "zustand";
import type { AddonSearchResponse } from "../../shared/api";
import { content, errorMessage } from "../api/client";
import { useLibrary } from "../store/library";
import { usePlayback } from "../store/playback";
import { trackSnapshot } from "../snapshots";
import { artistNames, Cover, IconButton, LikeButton, TrackRow, useLikeLookup } from "./common";
import { links } from "./router";
import { SEARCH_INPUT_ATTR } from "./shortcuts";

const DEBOUNCE_MS = 400;

interface SearchState {
  query: string;
  /** The query the shown result belongs to. */
  searched: string;
  loading: boolean;
  result: AddonSearchResponse | null;
  error?: string;
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
    try {
      const result = await content.search(query);
      if (get().query.trim() === query) set({ searched: query, result, loading: false, error: undefined });
    } catch (error) {
      if (get().query.trim() === query) set({ searched: query, result: null, loading: false, error: errorMessage(error) });
    }
  },
}));

export function SearchScreen() {
  const { query, searched, loading, result, error, setQuery, run } = useSearch();
  const recent = useLibrary((s) => s.recentSearches);
  const { playTrack, playNext, addToQueue } = usePlayback.getState();
  const remember = () => {
    const text = query.trim();
    if (text) void useLibrary.getState().addRecentSearch("query", text).catch(() => {});
  };

  useEffect(() => {
    const wanted = query.trim();
    if (wanted === searched) return;
    const timer = setTimeout(() => void run(wanted), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, searched, run]);

  const found = result?.results;
  useLikeLookup(found?.tracks.map((t) => t.id) ?? []);

  function submit(event: FormEvent) {
    event.preventDefault();
    remember();
  }
  const empty = found && found.tracks.length + found.albums.length + found.artists.length === 0;

  return (
    <div className="screen">
      <form onSubmit={submit}>
        <input
          className="search-box"
          type="search"
          placeholder="Search tracks, albums and artists"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
          {...{ [SEARCH_INPUT_ATTR]: "" }}
        />
      </form>
      {!query.trim() && recent.some((r) => r.kind === "query") && (
        <section>
          <h2>Recent searches</h2>
          <ul className="list-links">
            {recent
              .filter((r) => r.kind === "query")
              .map((r) => (
                <li key={r.key}>
                  <button className="link-button" onClick={() => setQuery(r.key)}>
                    {r.key}
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
      {loading && <p className="muted">Searching…</p>}
      {error && <p className="status error">{error}</p>}
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
                onPlay={() => {
                  remember();
                  playTrack(trackSnapshot(track));
                }}
                actions={
                  <>
                    <LikeButton track={track} />
                    <IconButton icon="next" label="Play next" onClick={() => playNext([trackSnapshot(track)])} />
                    <IconButton icon="add" label="Add to queue" onClick={() => addToQueue([trackSnapshot(track)])} />
                  </>
                }
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
              <a key={album.id} className="card" href={links.album(album.id)} onClick={remember}>
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
              <a key={artist.id} className="card" href={links.artist(artist.id)} onClick={remember}>
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
