import { useEffect, useState } from "react";
import type { PlaylistResponse } from "../../shared/api";
import { content, errorMessage, playlists } from "../api/client";
import { useLibrary } from "../store/library";
import { count, IconButton, Mosaic } from "./common";
import { openMenu, promptDialog, toast } from "./overlays";
import { ActionBar, formatTotal, PageHeader, ToggleIcon } from "./page";
import { playTracks } from "./play";
import { deletePlaylistFlow } from "./playlistActions";
import { links } from "./router";
import { TrackList } from "./tracks";

export function PlaylistScreen({ id }: { id: string }) {
  const [data, setData] = useState<PlaylistResponse>();
  const [error, setError] = useState<string>();
  const followed = useLibrary((s) => s.followedPlaylists.some((p) => p.id === id));

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
  const { playlist } = data;
  const tracks = data.tracks.map((e) => e.track);
  const context = { type: "playlist", id, name: playlist.name, image: playlist.covers[0] } as const;
  const rows = data.tracks.map((e) => ({ key: e.entryId, track: e.track }));
  const library = useLibrary.getState();
  const act = (action: () => Promise<PlaylistResponse | void>, done?: string) =>
    void action().then(
      (response) => {
        if (response) setData(response);
        if (done) toast(done);
      },
      (cause: unknown) => toast(errorMessage(cause)),
    );
  const meta = (
    <>
      <strong>
        <a href={links.user(playlist.owner.username)}>{playlist.owner.displayName}</a>
      </strong>
      <span>
        {" "}
        · {count(playlist.trackCount, "song")}{playlist.durationMs > 0 && `, ${formatTotal(playlist.durationMs)}`}
      </span>
    </>
  );

  return (
    <div className="screen">
      <PageHeader
        cover={<Mosaic covers={playlist.covers} />}
        kind={playlist.visibility === "public" ? "Public playlist" : "Private playlist"}
        title={playlist.name}
        meta={
          <>
            {playlist.description && <p className="page-description">{playlist.description}</p>}
            {meta}
          </>
        }
      />
      <ActionBar
        onPlay={tracks.length ? () => playTracks(tracks, context) : undefined}
        onShuffle={tracks.length ? () => playTracks(tracks, context, { shuffle: true }) : undefined}
      >
        {!playlist.isOwner && (
          <ToggleIcon
            on={followed}
            onLabel="Remove from Your Library"
            offLabel="Save to Your Library"
            onClick={() => act(() => library.setPlaylistFollowed(playlist, !followed), followed ? "Removed from Your Library" : "Saved to Your Library")}
          />
        )}
        {playlist.isOwner && (
          <IconButton
            icon="more"
            label="More options"
            className="large"
            onClick={(event) =>
              openMenu(event.currentTarget, {
                items: [
                  {
                    label: playlist.visibility === "public" ? "Make private" : "Make public",
                    icon: "user",
                    onSelect: () =>
                      act(() =>
                        library.updatePlaylist(id, { visibility: playlist.visibility === "public" ? "private" : "public" }),
                      ),
                  },
                  {
                    label: "Rename",
                    icon: "list",
                    onSelect: () =>
                      void promptDialog({ title: "Rename playlist", label: "Name", value: playlist.name }).then(
                        (name) => name && act(() => library.updatePlaylist(id, { name })),
                      ),
                  },
                  "separator",
                  { label: "Delete", icon: "remove", danger: true, onSelect: () => void deletePlaylistFlow(playlist) },
                ],
              })
            }
          />
        )}
      </ActionBar>
      {tracks.length === 0 && <p className="muted">This playlist is empty. Use “Add to playlist” in any track menu.</p>}
      <TrackList
        rows={rows}
        onPlay={(index) => playTracks(tracks, context, { index })}
        context={context}
        showCover
        showAlbum
        showHeader
        onRemove={
          playlist.isOwner
            ? (removed) =>
                act(
                  () => library.removeFromPlaylist(id, removed.map((r) => r.key)),
                  removed.length === 1 ? "Removed from playlist" : `${removed.length} tracks removed`,
                )
            : undefined
        }
      />
    </div>
  );
}
