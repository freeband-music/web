import { useEffect, useState, type CSSProperties } from "react";
import { currentItem, nextIndex } from "../queue/queue";
import { usePlayback } from "../store/playback";
import { useQueueStatus } from "../store/queueStatus";
import { QueueStatusDot } from "./QueueStatusDot";
import { ArtistLinks, Cover, formatTime, IconButton, LikeButton, NowStatus, useLikeLookup } from "./common";
import { links, navigate, useRoute } from "./router";

const MATCH_LABEL = { exact: "", edition: "Different edition", loose: "Loose match" } as const;

const fill = (value: number, max: number) => ({ "--p": `${max > 0 ? Math.min(value / max, 1) * 100 : 0}%` }) as CSSProperties;

/** The position slider with elapsed and total time; seeks when the drag ends. */
export function SeekBar() {
  const position = usePlayback((s) => s.player.position);
  const playerDuration = usePlayback((s) => s.player.duration);
  const trackMs = usePlayback((s) => currentItem(s.queue)?.track.durationMs ?? 0);
  const canSeek = usePlayback((s) => s.now.phase === "playing");
  const [dragging, setDragging] = useState<number | null>(null);
  const duration = playerDuration || trackMs / 1000;
  const shown = Math.min(dragging ?? position, duration || 0);
  const commit = () => {
    if (dragging !== null) usePlayback.getState().seek(dragging);
    setDragging(null);
  };
  return (
    <div className="seek">
      <span className="time">{formatTime(shown)}</span>
      <input
        className="range"
        type="range"
        min={0}
        max={duration || 1}
        step={1}
        value={shown}
        style={fill(shown, duration)}
        onChange={(event) => setDragging(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        disabled={!canSeek}
        aria-label="Seek"
        aria-valuetext={`${formatTime(shown)} of ${formatTime(duration)}`}
      />
      <span className="time">{duration ? formatTime(duration) : "-:--"}</span>
    </div>
  );
}

const NEXT_STATUS_MS = 15_000;

/** The status of the track that plays next, checked when it changes and every 15 s. */
function useNextStatus() {
  const nextId = usePlayback((s) => {
    const index = nextIndex(s.queue, s.repeat, true);
    return index === null || index === s.queue.current ? null : s.queue.items[index].track.id;
  });
  useEffect(() => {
    if (!nextId) return;
    const { load } = useQueueStatus.getState();
    void load([nextId]);
    const timer = setInterval(() => {
      if (!document.hidden) void load([nextId]);
    }, NEXT_STATUS_MS);
    return () => clearInterval(timer);
  }, [nextId]);
  return useQueueStatus((s) => (nextId ? s.statuses[nextId] : undefined));
}

/** Shuffle, previous, play/pause, next and repeat (off → all → one). */
export function TransportControls({ large }: { large?: boolean }) {
  const hasTrack = usePlayback((s) => currentItem(s.queue) !== undefined);
  const busy = usePlayback((s) => s.player.status === "playing" || s.player.status === "loading");
  const shuffle = usePlayback((s) => s.shuffle);
  const repeat = usePlayback((s) => s.repeat);
  const hasNext = usePlayback((s) => nextIndex(s.queue, s.repeat) !== null);
  const { toggle, next, previous, setShuffle, cycleRepeat } = usePlayback.getState();
  const nextStatus = useNextStatus();
  const size = large ? "large" : undefined;
  return (
    <div className={large ? "transport large" : "transport"}>
      <IconButton
        icon="shuffle"
        label={shuffle ? "Turn shuffle off" : "Turn shuffle on"}
        onClick={() => setShuffle(!shuffle)}
        active={shuffle}
        className={["toggle", size].filter(Boolean).join(" ")}
      />
      <IconButton icon="previous" label="Previous" onClick={previous} disabled={!hasTrack} className={size} />
      <IconButton icon={busy ? "pause" : "play"} label={busy ? "Pause" : "Play"} onClick={toggle} disabled={!hasTrack} primary />
      <span className="next-status">
        <IconButton icon="next" label="Next" onClick={next} disabled={!hasNext} className={size} />
        {nextStatus && <QueueStatusDot status={nextStatus} />}
      </span>
      <IconButton
        icon="repeat"
        label={repeat === "off" ? "Repeat all" : repeat === "all" ? "Repeat one" : "Turn repeat off"}
        onClick={cycleRepeat}
        active={repeat !== "off"}
        className={["toggle", repeat === "one" && "repeat-one", size].filter(Boolean).join(" ")}
      />
    </div>
  );
}

export function VolumeControl() {
  const volume = usePlayback((s) => s.volume);
  const muted = usePlayback((s) => s.muted);
  const { setVolume, toggleMute } = usePlayback.getState();
  const shown = muted ? 0 : volume;
  return (
    <div className="volume-control">
      <IconButton icon={muted || volume === 0 ? "mute" : "volume"} label={muted ? "Unmute" : "Mute"} onClick={toggleMute} />
      <input
        className="range volume"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={shown}
        style={fill(shown, 1)}
        onChange={(event) => setVolume(Number(event.target.value))}
        aria-label="Volume"
      />
    </div>
  );
}

export function PlayerBar() {
  const item = usePlayback((s) => currentItem(s.queue));
  const now = usePlayback((s) => s.now);
  const onQueue = useRoute().name === "queue";
  const track = item?.track;
  useLikeLookup(track ? [track.id] : []);
  const stream = now.phase === "playing" ? now.stream : undefined;
  const matchLabel = stream ? MATCH_LABEL[stream.match.kind] : "";

  return (
    <footer className="player">
      <div className="player-track">
        {track && (
          <>
            <Cover src={track.album?.cover} />
            <div className="player-text">
              <span className="track-title">
                {track.album ? <a href={links.album(track.album.id)}>{track.title}</a> : track.title}
              </span>
              <span className="muted">
                <ArtistLinks artists={track.artists} />
              </span>
              <NowStatus now={now} />
            </div>
            <LikeButton track={track} />
          </>
        )}
      </div>

      <div className="player-center">
        <TransportControls />
        <SeekBar />
      </div>

      <div className="player-extra">
        {matchLabel && <span className="badge warn">{matchLabel}</span>}
        {stream && <span className="badge">{stream.quality.codec.toUpperCase()}</span>}
        <IconButton
          icon="queue"
          label="Queue"
          onClick={() => navigate(links.queue)}
          active={onQueue}
          className="toggle"
        />
        <VolumeControl />
      </div>
    </footer>
  );
}
