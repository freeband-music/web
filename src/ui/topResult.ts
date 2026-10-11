import type { PlaylistSummary } from "../../shared/api";
import type { AlbumSummary, ArtistSummary, SearchResponse, TrackSummary } from "../types";

export type TopResult =
  | { kind: "artist"; artist: ArtistSummary }
  | { kind: "track"; track: TrackSummary }
  | { kind: "album"; album: AlbumSummary }
  | { kind: "playlist"; playlist: PlaylistSummary };

/** Lower case, no accents, single spaces. */
export function normalizeName(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** A name as compared with the query: also without punctuation and a leading article. */
export function matchKey(text: string): string {
  return normalizeName(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

type Candidate = Exclude<TopResult, { kind: "playlist" }>;

/** On equal popularity an album wins over an artist, and an artist over a song. */
const KIND_RANK = { album: 0, artist: 1, track: 2 } as const;

function popularity(c: Candidate): number | undefined {
  const value = c.kind === "artist" ? c.artist.popularity : c.kind === "album" ? c.album.popularity : c.track.popularity;
  return typeof value === "number" ? value : undefined;
}

function mostPopular(candidates: Candidate[]): Candidate | null {
  if (!candidates.some((c) => popularity(c) !== undefined)) return null;
  return candidates.reduce((best, c) => {
    const diff = (popularity(c) ?? -1) - (popularity(best) ?? -1);
    return diff > 0 || (diff === 0 && KIND_RANK[c.kind] < KIND_RANK[best.kind]) ? c : best;
  });
}

/**
 * The search's "Top result": among artists, albums and songs named like the
 * query, the most popular; with no such match, the most popular of the first
 * result of each kind. Without popularity: an artist named like the query,
 * else the first song, album, artist or playlist.
 */
export function pickTopResult(query: string, results: SearchResponse, playlists: PlaylistSummary[] = []): TopResult | null {
  const wanted = matchKey(query);
  const all: Candidate[] = [
    ...results.albums.map((album) => ({ kind: "album" as const, album })),
    ...results.artists.map((artist) => ({ kind: "artist" as const, artist })),
    ...results.tracks.map((track) => ({ kind: "track" as const, track })),
  ];
  const name = (c: Candidate) => (c.kind === "artist" ? c.artist.name : c.kind === "album" ? c.album.title : c.track.title);
  const exact = all.filter((c) => matchKey(name(c)) === wanted);
  const firsts: Candidate[] = [];
  if (results.albums[0]) firsts.push({ kind: "album", album: results.albums[0] });
  if (results.artists[0]) firsts.push({ kind: "artist", artist: results.artists[0] });
  if (results.tracks[0]) firsts.push({ kind: "track", track: results.tracks[0] });
  const popular = exact.length > 0 ? mostPopular(exact) : mostPopular(firsts);
  if (popular) return popular;

  const artist = exact.find((c) => c.kind === "artist");
  if (artist) return artist;
  if (results.tracks[0]) return { kind: "track", track: results.tracks[0] };
  if (results.albums[0]) return { kind: "album", album: results.albums[0] };
  if (results.artists[0]) return { kind: "artist", artist: results.artists[0] };
  if (playlists[0]) return { kind: "playlist", playlist: playlists[0] };
  return null;
}

/**
 * Songs ordered to follow the top result: an album's own tracks first, or the
 * top artist's songs first (most popular first); then the other songs.
 */
export function songsFollowing(top: TopResult | null, tracks: TrackSummary[], albumTracks: TrackSummary[] = []): TrackSummary[] {
  let first: TrackSummary[] = [];
  if (top?.kind === "album") first = albumTracks;
  else if (top?.kind === "artist") {
    first = tracks
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => track.artists.some((a) => a.id === top.artist.id))
      .sort((a, b) => (b.track.popularity ?? -1) - (a.track.popularity ?? -1) || a.index - b.index)
      .map(({ track }) => track);
  }
  const ids = new Set(first.map((t) => t.id));
  return [...first, ...tracks.filter((t) => !ids.has(t.id))];
}
