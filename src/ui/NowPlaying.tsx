// The full-screen Now Playing view on phones, opened from the mini player.

import { useEffect, useRef } from "react";
import { create } from "zustand";
import { currentItem } from "../queue/queue";
import { usePlayback } from "../store/playback";
import { ArtistLinks, Cover, IconButton, LikeButton, NowStatus, useLikeLookup } from "./common";
import { useIsPhone } from "./overlays";
import { SeekBar, TransportControls, VolumeControl } from "./PlayerBar";
import { links, navigate, useRoute } from "./router";
import { openTrackMenu } from "./tracks";

const useNowPlaying = create<{ open: boolean }>()(() => ({ open: false }));

/** Opens the full-screen Now Playing view (phones). */
export function openNowPlaying(): void {
  useNowPlaying.setState({ open: true });
}

const closeNowPlaying = () => useNowPlaying.setState({ open: false });

/** A downward swipe of this many pixels closes the view. */
const SWIPE_CLOSE = 90;

const CONTEXT_LABEL = { album: "album", playlist: "playlist", artist: "artist", search: "search", queue: "queue" } as const;

export function NowPlaying() {
  const open = useNowPlaying((s) => s.open);
  const phone = useIsPhone();
  const item = usePlayback((s) => currentItem(s.queue));
  const now = usePlayback((s) => s.now);
  const route = JSON.stringify(useRoute());
  const start = useRef<number | null>(null);
  useLikeLookup(item ? [item.track.id] : []);

  // Following a link inside closes the view; so does leaving phone layout or an empty queue.
  useEffect(() => closeNowPlaying(), [route]);
  useEffect(() => {
    if (open && (!phone || !item)) closeNowPlaying();
  }, [open, phone, item]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeNowPlaying();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !item) return null;
  const { track, context } = item;
  const from = context.name
    ? context.name
    : context.type === "search"
      ? "Search"
      : "Your queue";

  return (
    <div className="now-playing" role="dialog" aria-modal="true" aria-label="Now playing">
      <div
        className="now-swipe"
        onPointerDown={(event) => {
          start.current = event.clientY;
        }}
        onPointerUp={(event) => {
          if (start.current !== null && event.clientY - start.current > SWIPE_CLOSE) closeNowPlaying();
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        <header className="now-head">
          <IconButton icon="chevronDown" label="Close" onClick={closeNowPlaying} />
          <span className="now-from">
            <span className="muted">Playing from {CONTEXT_LABEL[context.type]}</span>
            <strong>{from}</strong>
          </span>
          <IconButton icon="more" label="More options" onClick={(event) => openTrackMenu(event.currentTarget, [track])} />
        </header>
        <div className="now-cover">
          <Cover src={track.album?.cover} />
        </div>
      </div>
      <div className="now-info">
        <span className="now-text">
          <span className="now-title">
            {track.album ? <a href={links.album(track.album.id)}>{track.title}</a> : track.title}
          </span>
          <span className="muted">
            <ArtistLinks artists={track.artists} />
          </span>
        </span>
        <LikeButton track={track} />
      </div>
      <NowStatus now={now} />
      <SeekBar />
      <TransportControls large />
      <footer className="now-foot">
        <VolumeControl />
        <IconButton
          icon="queue"
          label="Queue"
          onClick={() => {
            closeNowPlaying();
            navigate(links.queue);
          }}
        />
      </footer>
    </div>
  );
}
