// The Library screen's items, filtering and sorting (pure).

import type { FollowedArtist, PlaylistSummary, RecentContext, SavedAlbum } from "../../shared/api";
import { normalizeName } from "./topResult";

export type LibraryKind = "playlist" | "album" | "artist";
export type LibrarySort = "recent" | "added" | "alphabetical";

export interface LibraryItem {
  kind: LibraryKind | "liked";
  id: string;
  title: string;
  subtitle: string;
  covers: string[];
  /** When it was created, saved or followed. */
  addedAt: string;
  /** When it was last played, if it was. */
  playedAt?: string;
}

/** True when every word of `filter` appears in one of the fields. */
export function matchesFilter(filter: string, ...fields: (string | undefined)[]): boolean {
  const words = normalizeName(filter).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const text = normalizeName(fields.filter(Boolean).join(" "));
  return words.every((w) => text.includes(w));
}

export function libraryItems(input: {
  playlists: PlaylistSummary[];
  followedPlaylists: PlaylistSummary[];
  albums: SavedAlbum[];
  artists: FollowedArtist[];
  recent: RecentContext[];
}): LibraryItem[] {
  const played = new Map(input.recent.map((c) => [`${c.type}:${c.id}`, c.lastPlayedAt]));
  const at = (kind: LibraryKind, id: string) => played.get(`${kind}:${id}`);
  return [
    ...[...input.playlists, ...input.followedPlaylists].map((p) => ({
      kind: "playlist" as const,
      id: p.id,
      title: p.name,
      subtitle: `Playlist · ${p.owner.displayName}`,
      covers: p.covers,
      addedAt: p.followedAt ?? p.createdAt,
      playedAt: at("playlist", p.id),
    })),
    ...input.albums.map(({ album, savedAt }) => ({
      kind: "album" as const,
      id: album.id,
      title: album.title,
      subtitle: `Album · ${album.artists.map((a) => a.name).join(", ")}`,
      covers: album.cover ? [album.cover] : [],
      addedAt: savedAt,
      playedAt: at("album", album.id),
    })),
    ...input.artists.map(({ artist, followedAt }) => ({
      kind: "artist" as const,
      id: artist.id,
      title: artist.name,
      subtitle: "Artist",
      covers: artist.image ? [artist.image] : [],
      addedAt: followedAt,
      playedAt: at("artist", artist.id),
    })),
  ];
}

/** "Recent" is the later of last played and added. */
export function sortLibrary(items: LibraryItem[], sort: LibrarySort): LibraryItem[] {
  const recent = (i: LibraryItem) => (i.playedAt && i.playedAt > i.addedAt ? i.playedAt : i.addedAt);
  const sorted = [...items];
  if (sort === "alphabetical") sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  else if (sort === "added") sorted.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  else sorted.sort((a, b) => recent(b).localeCompare(recent(a)));
  return sorted;
}
