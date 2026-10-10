import { usePlayback } from "../store/playback";
import { Cover, IconButton, NowStatus, TrackRow } from "./common";
import { createPlaylistFlow } from "./playlistActions";

export function QueueScreen() {
  const { queue, now, jumpTo, remove, move, clear } = usePlayback();
  const last = queue.items.length - 1;
  return (
    <div className="screen">
      <header className="title-row">
        <h1>Queue</h1>
        {queue.items.length > 0 && (
          <span className="dev-tools">
            <button className="button" onClick={() => void createPlaylistFlow(queue.items.map((i) => i.track))}>
              Save as playlist
            </button>
            <button className="button" onClick={clear}>
              Clear
            </button>
          </span>
        )}
      </header>
      {queue.items.length === 0 && <p className="muted">The queue is empty. Search for something to play.</p>}
      <ul className="tracks">
        {queue.items.map((item, index) => (
          <TrackRow
            key={item.key}
            track={item.track}
            lead={<Cover src={item.track.album?.cover} />}
            showAlbum
            current={index === queue.current}
            status={index === queue.current && <NowStatus now={now} />}
            onPlay={() => jumpTo(index)}
            actions={
              <>
                <IconButton icon="up" label="Move up" onClick={() => move(index, -1)} disabled={index === 0} />
                <IconButton icon="down" label="Move down" onClick={() => move(index, 1)} disabled={index === last} />
                <IconButton icon="remove" label="Remove" onClick={() => remove(index)} />
              </>
            }
          />
        ))}
      </ul>
    </div>
  );
}
