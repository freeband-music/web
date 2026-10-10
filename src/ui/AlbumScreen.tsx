import { currentItem } from "../queue/queue";
import { addonClient } from "../store/addons";
import { usePlayback } from "../store/playback";
import { ArtistLinks, Cover, NowStatus, TrackRow, useAsync } from "./common";

export function AlbumScreen({ id }: { id: string }) {
  const album = useAsync(() => addonClient.getAlbum(id), id);
  const playAlbum = usePlayback((s) => s.playAlbum);
  const current = usePlayback((s) => currentItem(s.queue));
  const now = usePlayback((s) => s.now);

  if (album.loading) return <p className="screen muted">Loading…</p>;
  if ("error" in album) return <p className="screen status error">{album.error}</p>;
  const { title, artists, year, cover, tracks } = album.data;
  const multiDisc = new Set(tracks.map((t) => t.discNumber ?? 1)).size > 1;

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
          <button className="button primary" onClick={() => playAlbum(album.data, 0)} disabled={tracks.length === 0}>
            Play album
          </button>
        </div>
      </header>
      <ul className="tracks">
        {tracks.map((track, index) => {
          const isCurrent = current?.albumId === id && current.track.id === track.id;
          const number = track.trackNumber ?? String(index + 1);
          return (
            <TrackRow
              key={`${index}-${track.id}`}
              track={track}
              lead={multiDisc && track.discNumber ? `${track.discNumber}-${number}` : number}
              current={isCurrent}
              status={isCurrent && <NowStatus now={now} />}
              onPlay={() => playAlbum(album.data, index)}
            />
          );
        })}
      </ul>
    </div>
  );
}
