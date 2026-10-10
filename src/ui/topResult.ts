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

/**
 * The search's "Top result": an artist whose name is the query, else the
 * first track, else the first album, then the first artist or playlist.
 */
export function pickTopResult(query: string, results: SearchResponse, playlists: PlaylistSummary[] = []): TopResult | null {
  const wanted = normalizeName(query);
  const artist = results.artists.find((a) => normalizeName(a.name) === wanted);
  if (artist) return { kind: "artist", artist };
  if (results.tracks[0]) return { kind: "track", track: results.tracks[0] };
  if (results.albums[0]) return { kind: "album", album: results.albums[0] };
  if (results.artists[0]) return { kind: "artist", artist: results.artists[0] };
  if (playlists[0]) return { kind: "playlist", playlist: playlists[0] };
  return null;
}
