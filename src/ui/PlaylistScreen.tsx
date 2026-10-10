import { useEffect, useState } from "react";
import type { PlaylistResponse } from "../../shared/api";
import { content, errorMessage, playlists } from "../api/client";
import { currentItem } from "../queue/queue";
import { useLibrary } from "../store/library";
import { usePlayback } from "../store/playback";
import { Cover, IconButton, LikeButton, NowStatus, TrackRow, useLikeLookup } from "./common";
import { links, navigate } from "./router";

export function PlaylistScreen({ id }: { id: string }) {
  const [data, setData] = useState<PlaylistResponse>();
  const [error, setError] = useState<string>();
  const current = usePlayback((s) => currentItem(s.queue));
  const now = usePlayback((s) => s.now);
  const followed = useLibrary((s) => s.followedPlaylists.some((p) => p.id === id));
  useLikeLookup(data?.tracks.map((e) => e.track.id) ?? []);

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    setError(undefined);
    playlists.get(id).then(
      (response) => {
        if (cancelled) return;
        setData(response);
        const albumIds = [...new Set(response.tracks.flatMap((e) => (e.track.album ? [e.track.album.id] : [])))];
        if (albumIds.length > 0) void content.prefetchMeta({ albumIds }).catch(() => {});
      },
      (cause: unknown) => !cancelled && setError(errorMessage(cause)),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <p className="screen status error">{error}</p>;
  if (!data) return <p className="screen muted">Loading…</p>;
  const { playlist, tracks } = data;
  const context = { type: "playlist", id, name: playlist.name, image: playlist.covers[0] } as const;
  const play = (index: number) =>
    usePlayback.getState().playList(
      tracks.map((e) => e.track),
      index,
      context,
    );
  const library = useLibrary.getState();
  const act = (action: () => Promise<PlaylistResponse | void>) =>
    void action().then(
      (response) => response && setData(response),
      (cause: unknown) => setError(errorMessage(cause)),
    );

  return (
    <div className="screen">
      <header className="hero">
        <Cover src={playlist.covers[0]} />
        <div>
          <p className="muted">{playlist.visibility === "public" ? "Public playlist" : "Private playlist"}</p>
          <h1>{playlist.name}</h1>
          {playlist.description && <p>{playlist.description}</p>}
          <p className="muted">
            {playlist.owner.displayName} · {playlist.trackCount} tracks
          </p>
          <p className="dev-tools">
            <button className="button primary" onClick={() => play(0)} disabled={tracks.length === 0}>
              Play
            </button>
            {playlist.isOwner ? (
              <>
                <button
                  className="button"
                  onClick={() =>
                    act(() =>
                      library.updatePlaylist(id, {
                        visibility: playlist.visibility === "public" ? "private" : "public",
                      }),
                    )
                  }
                >
                  Make {playlist.visibility === "public" ? "private" : "public"}
                </button>
                <button
                  className="button"
                  onClick={() => {
                    if (window.confirm(`Delete “${playlist.name}”?`)) {
                      act(async () => {
                        await library.deletePlaylist(id);
                        navigate(links.library, true);
                      });
                    }
                  }}
                >
                  Delete
                </button>
              </>
            ) : (
              <button className="button" onClick={() => act(() => library.setPlaylistFollowed(playlist, !followed))}>
                {followed ? "Unfollow" : "Follow"}
              </button>
            )}
          </p>
        </div>
      </header>
      {tracks.length === 0 && <p className="muted">This playlist is empty.</p>}
      <ul className="tracks">
        {tracks.map((entry, index) => {
          const isCurrent =
            current?.context.type === "playlist" && current.context.id === id && current.track.id === entry.track.id;
          return (
            <TrackRow
              key={entry.entryId}
              track={entry.track}
              lead={<Cover src={entry.track.album?.cover} />}
              showAlbum
              current={isCurrent}
              status={isCurrent && <NowStatus now={now} />}
              onPlay={() => play(index)}
              actions={
                <>
                  <LikeButton track={entry.track} />
                  {playlist.isOwner && (
                    <IconButton
                      icon="remove"
                      label="Remove from playlist"
                      onClick={() => act(() => library.removeFromPlaylist(id, [entry.entryId]))}
                    />
                  )}
                </>
              }
            />
          );
        })}
      </ul>
    </div>
  );
}
