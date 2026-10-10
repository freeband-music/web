// Starting playback of a whole album, playlist, artist or list from anywhere (cards, headers).

import type { PlayContext, TrackSnapshot } from "../../shared/api";
import { content, errorMessage, library, playlists } from "../api/client";
import { usePlayback } from "../store/playback";
import { trackSnapshot } from "../snapshots";
import { toast } from "./overlays";

/** Albums of an artist whose tracks "Play" on the artist page queues. */
const ARTIST_ALBUMS = 5;

export const LIKED_CONTEXT: PlayContext = { type: "queue", name: "Liked songs" };

/** Replaces the queue with `tracks`; with `shuffle`, turns shuffle on and starts at a random track. */
export function playTracks(tracks: TrackSnapshot[], context: PlayContext, options: { index?: number; shuffle?: boolean } = {}) {
  if (tracks.length === 0) return;
  const playback = usePlayback.getState();
  if (options.shuffle !== undefined && options.shuffle !== playback.shuffle) playback.setShuffle(options.shuffle);
  const index = options.index ?? (options.shuffle ? Math.floor(Math.random() * tracks.length) : 0);
  playback.playList(tracks, index, context);
}

async function run(load: () => Promise<[TrackSnapshot[], PlayContext]>, shuffle?: boolean) {
  try {
    const [tracks, context] = await load();
    if (tracks.length === 0) toast("Nothing to play here.");
    playTracks(tracks, context, { shuffle });
  } catch (error) {
    toast(errorMessage(error));
  }
}

export const albumTracks = async (id: string): Promise<[TrackSnapshot[], PlayContext]> => {
  const album = await content.album(id);
  return [
    album.tracks.map((t) => trackSnapshot(t, album)),
    { type: "album", id, name: album.title, image: album.cover },
  ];
};

export const playlistTracks = async (id: string): Promise<[TrackSnapshot[], PlayContext]> => {
  const { playlist, tracks } = await playlists.get(id);
  return [tracks.map((e) => e.track), { type: "playlist", id, name: playlist.name, image: playlist.covers[0] }];
};

/** An artist's first few listed albums, in order (the protocol has no top tracks). */
export const artistTracks = async (id: string): Promise<[TrackSnapshot[], PlayContext]> => {
  const artist = await content.artist(id);
  const albums = await Promise.all(
    artist.albums.slice(0, ARTIST_ALBUMS).map((a) => content.album(a.id).catch(() => undefined)),
  );
  const tracks = albums.flatMap((album) => (album ? album.tracks.map((t) => trackSnapshot(t, album)) : []));
  return [tracks, { type: "artist", id, name: artist.name, image: artist.image }];
};

export const likedTracks = async (): Promise<[TrackSnapshot[], PlayContext]> => {
  const { tracks } = await library.likes();
  return [tracks.map((t) => t.track), LIKED_CONTEXT];
};

export const playAlbumById = (id: string, shuffle?: boolean) => run(() => albumTracks(id), shuffle);
export const playPlaylistById = (id: string, shuffle?: boolean) => run(() => playlistTracks(id), shuffle);
export const playArtistById = (id: string, shuffle?: boolean) => run(() => artistTracks(id), shuffle);
export const playLiked = (shuffle?: boolean) => run(likedTracks, shuffle);

export function playContext(type: "album" | "playlist" | "artist", id: string): Promise<void> {
  if (type === "album") return playAlbumById(id);
  if (type === "playlist") return playPlaylistById(id);
  return playArtistById(id);
}
