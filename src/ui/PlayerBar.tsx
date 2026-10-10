import { currentItem } from "../queue/queue";
import { usePlayback } from "../store/playback";
import { ArtistLinks, Cover, formatTime, IconButton, NowStatus } from "./common";
import { links } from "./router";

const MATCH_LABEL = { exact: "", edition: "Different edition", loose: "Loose match" } as const;

export function PlayerBar() {
  const item = usePlayback((s) => currentItem(s.queue));
  const now = usePlayback((s) => s.now);
  const player = usePlayback((s) => s.player);
  const volume = usePlayback((s) => s.volume);
  const hasNext = usePlayback((s) => s.queue.current < s.queue.items.length - 1);
  const { toggle, next, previous, seek, setVolume } = usePlayback.getState();

  const track = item?.track;
  const stream = now.phase === "playing" ? now.stream : undefined;
  const duration = player.duration || (track?.durationMs ?? 0) / 1000;
  const busy = player.status === "playing" || player.status === "loading";
  const matchLabel = stream ? MATCH_LABEL[stream.match.kind] : "";

  return (
    <footer className="player">
      <div className="player-track">
        <Cover src={track?.album?.cover} />
        <div className="player-text">
          {track ? (
            <>
              <span className="track-title">
                {track.album ? <a href={links.album(track.album.id)}>{track.title}</a> : track.title}
              </span>
              <span className="muted">
                <ArtistLinks artists={track.artists} />
              </span>
              <NowStatus now={now} />
            </>
          ) : (
            <span className="muted">Nothing playing</span>
          )}
        </div>
      </div>

      <div className="player-controls">
        <IconButton icon="previous" label="Previous" onClick={previous} disabled={!track} />
        <IconButton
          icon={busy ? "pause" : "play"}
          label={busy ? "Pause" : "Play"}
          onClick={toggle}
          disabled={!track}
          primary
        />
        <IconButton icon="next" label="Next" onClick={next} disabled={!hasNext} />
      </div>

      <div className="player-seek">
        <span className="time">{formatTime(player.position)}</span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={1}
          value={Math.min(player.position, duration || 1)}
          onChange={(event) => seek(Number(event.target.value))}
          disabled={!stream}
          aria-label="Seek"
        />
        <span className="time">{duration ? formatTime(duration) : ""}</span>
      </div>

      <div className="player-extra">
        {matchLabel && <span className="badge warn">{matchLabel}</span>}
        {stream && <span className="badge">{stream.quality.codec.toUpperCase()}</span>}
        <input
          className="volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
          aria-label="Volume"
        />
      </div>
    </footer>
  );
}
