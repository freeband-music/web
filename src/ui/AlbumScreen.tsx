import { content } from "../api/client";
import { useLibrary } from "../store/library";
import { albumSnapshot, trackSnapshot } from "../snapshots";
import { ArtistLinks, count, Cover, IconButton, useAsync } from "./common";
import { toast } from "./overlays";
import { ActionBar, formatTotal, PageHeader, ToggleIcon } from "./page";
import { playTracks } from "./play";
import { openTrackMenu, TrackList } from "./tracks";

export function AlbumScreen({ id }: { id: string }) {
  const album = useAsync(() => content.album(id), id);
  const saved = useLibrary((s) => s.albums.some((a) => a.album.id === id));

  if (album.loading) return <p className="screen muted">Loading…</p>;
  if ("error" in album) return <p className="screen status error">{album.error}</p>;
  const data = album.data;
  const { title, artists, year, cover } = data;
  const tracks = data.tracks.map((t) => trackSnapshot(t, data));
  const context = { type: "album", id, name: title, image: cover } as const;
  const multiDisc = new Set(tracks.map((t) => t.discNumber ?? 1)).size > 1;
  const rows = tracks.map((track, index) => {
    const number = track.trackNumber ?? String(index + 1);
    return { key: `${index}-${track.id}`, track, lead: multiDisc && track.discNumber ? `${track.discNumber}-${number}` : number };
  });
  const total = tracks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  const toggleSaved = () =>
    void useLibrary
      .getState()
      .setAlbumSaved(albumSnapshot(data), !saved)
      .then(
        () => toast(saved ? "Removed from Your Library" : "Saved to Your Library"),
        () => toast("Could not update Your Library."),
      );

  return (
    <div className="screen">
      <PageHeader
        cover={<Cover src={cover} />}
        kind="Album"
        title={title}
        meta={
          <>
            <strong>
              <ArtistLinks artists={artists} />
            </strong>
            {year && <span> · {year}</span>}
            <span>
              {" "}
              · {count(tracks.length, "song")}{total > 0 && `, ${formatTotal(total)}`}
            </span>
          </>
        }
      />
      <ActionBar
        onPlay={tracks.length ? () => playTracks(tracks, context) : undefined}
        onShuffle={tracks.length ? () => playTracks(tracks, context, { shuffle: true }) : undefined}
      >
        <ToggleIcon on={saved} onLabel="Remove from Your Library" offLabel="Save to Your Library" onClick={toggleSaved} />
        <IconButton icon="more" label="More options" className="large" onClick={(event) => openTrackMenu(event.currentTarget, tracks)} />
      </ActionBar>
      <TrackList rows={rows} onPlay={(index) => playTracks(tracks, context, { index })} context={context} showHeader />
    </div>
  );
}
