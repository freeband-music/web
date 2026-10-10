import { content } from "../api/client";
import { currentItem } from "../queue/queue";
import { useLibrary } from "../store/library";
import { usePlayback } from "../store/playback";
import { albumSnapshot } from "../snapshots";
import { ArtistLinks, Cover, LikeButton, NowStatus, TrackRow, useAsync, useLikeLookup } from "./common";

export function AlbumScreen({ id }: { id: string }) {
  const album = useAsync(() => content.album(id), id);
  const playAlbum = usePlayback((s) => s.playAlbum);
  const current = usePlayback((s) => currentItem(s.queue));
  const now = usePlayback((s) => s.now);
  const saved = useLibrary((s) => s.albums.some((a) => a.album.id === id));
  useLikeLookup(album.loading || "error" in album ? [] : album.data.tracks.map((t) => t.id));

  if (album.loading) return <p className="screen muted">Loading…</p>;
  if ("error" in album) return <p className="screen status error">{album.error}</p>;
  const { title, artists, year, cover, tracks } = album.data;
  const multiDisc = new Set(tracks.map((t) => t.discNumber ?? 1)).size > 1;
  const fromHere = current?.context.type === "album" && current.context.id === id;
  const toggleSaved = () =>
    void useLibrary.getState().setAlbumSaved(albumSnapshot(album.data), !saved).catch(() => {});

  return (
    <div className="screen">
      <header className="hero">
        <Cover src={cover} />
        <div>
          <p className="muted">Album</p>
          <h1>{title}</h1>
          <p>
            <ArtistLinks artists={artists} />
            {year && <span className="muted"> · {year}</span>}
          </p>
          <p className="dev-tools">
            <button className="button primary" onClick={() => playAlbum(album.data, 0)} disabled={tracks.length === 0}>
              Play album
            </button>
            <button className="button" onClick={toggleSaved}>
              {saved ? "Remove from Library" : "Save to Library"}
            </button>
          </p>
        </div>
      </header>
      <ul className="tracks">
        {tracks.map((track, index) => {
          const isCurrent = fromHere && current.track.id === track.id;
          const number = track.trackNumber ?? String(index + 1);
          return (
            <TrackRow
              key={`${index}-${track.id}`}
              track={track}
              lead={multiDisc && track.discNumber ? `${track.discNumber}-${number}` : number}
              current={isCurrent}
              status={isCurrent && <NowStatus now={now} />}
              onPlay={() => playAlbum(album.data, index)}
              actions={<LikeButton track={track} />}
            />
          );
        })}
      </ul>
    </div>
  );
}
