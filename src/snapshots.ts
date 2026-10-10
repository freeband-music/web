// Protocol items as the library stores them: summaries without nested lists.

import type { AlbumSnapshot, ArtistSnapshot, TrackSnapshot } from "../shared/api";
import type { Album, AlbumSummary, Artist, ArtistSummary, TrackSummary } from "./types";

export function albumSnapshot(album: Album | AlbumSummary): AlbumSnapshot {
  const { id, title, artists, year, trackCount, cover } = album;
  const tracks = "tracks" in album ? album.tracks : undefined;
  return { id, title, artists, year, trackCount: trackCount ?? tracks?.length, cover };
}

export function artistSnapshot(artist: Artist | ArtistSummary): ArtistSnapshot {
  const { id, name, image } = artist;
  return { id, name, image };
}

/** A track, with `album` filled in (a track listed inside an album often leaves it out). */
export function trackSnapshot(track: TrackSummary, album?: Album | AlbumSummary): TrackSnapshot {
  const { id, title, artists, trackNumber, discNumber, durationMs, isrc } = track;
  let from: AlbumSnapshot | undefined = track.album ?? (album && albumSnapshot(album));
  if (from && from.trackCount === undefined && album) from = { ...from, trackCount: albumSnapshot(album).trackCount };
  return {
    id,
    title,
    artists,
    album: from && albumSnapshot(from),
    trackNumber,
    discNumber,
    durationMs,
    isrc,
  };
}

/** The protocol's track summary of a snapshot (drops the client-only fields). */
export function trackSummary(snapshot: TrackSnapshot): TrackSummary {
  const { addonBaseUrl: _omitted, ...summary } = snapshot;
  return summary;
}
