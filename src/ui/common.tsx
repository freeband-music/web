import { useEffect, useState, type ReactNode } from "react";
import { errorMessage } from "../api/client";
import { useLibrary } from "../store/library";
import type { NowState } from "../store/playback";
import { trackSnapshot } from "../snapshots";
import type { ArtistSummary, TrackSummary } from "../types";
import { links } from "./router";

export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "";
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const artistNames = (artists: ArtistSummary[]) => artists.map((a) => a.name).join(", ");

export function ArtistLinks({ artists }: { artists: ArtistSummary[] }) {
  return (
    <>
      {artists.map((artist, i) => (
        <span key={artist.id}>
          {i > 0 && ", "}
          <a href={links.artist(artist.id)}>{artist.name}</a>
        </span>
      ))}
    </>
  );
}

/** Square artwork with a plain placeholder when there is no image or it fails to load. */
export function Cover({ src, round }: { src?: string; round?: boolean }) {
  const [failed, setFailed] = useState<string>();
  return (
    <div className={round ? "cover round" : "cover"}>
      {src && failed !== src && <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} />}
    </div>
  );
}

type Async<T> = { loading: true } | { loading: false; data: T } | { loading: false; error: string };

export function useAsync<T>(load: () => Promise<T>, key: string): Async<T> {
  const [state, setState] = useState<{ key: string; value: Async<T> }>({ key, value: { loading: true } });
  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => !cancelled && setState({ key, value: { loading: false, data } }),
      (error: unknown) =>
        !cancelled &&
        setState({ key, value: { loading: false, error: errorMessage(error) } }),
    );
    return () => {
      cancelled = true;
    };
    // `load` is re-created on every render; `key` identifies the request.
  }, [key]);
  return state.key === key ? state.value : { loading: true };
}

/** The visible state of the current track while it is not simply playing. */
export function NowStatus({ now }: { now: NowState }) {
  switch (now.phase) {
    case "resolving":
      return <span className="status">Finding a source…</span>;
    case "queued":
      return <span className="status">Not available yet. It has been requested; try again later.</span>;
    case "not_found":
      return <span className="status">No source found for this track.</span>;
    case "no_addon":
      return (
        <span className="status">
          No stream add-on installed. <a href={links.addons}>Open Add-ons</a>
        </span>
      );
    case "error":
      return <span className="status error">{now.message}</span>;
    default:
      return null;
  }
}

interface TrackRowProps {
  track: TrackSummary;
  /** Shown in the leading column, for example the track number. */
  lead?: ReactNode;
  showAlbum?: boolean;
  current?: boolean;
  status?: ReactNode;
  onPlay(): void;
  actions?: ReactNode;
}

export function TrackRow({ track, lead, showAlbum, current, status, onPlay, actions }: TrackRowProps) {
  return (
    <li className={current ? "track current" : "track"}>
      <button className="track-main" onClick={onPlay} title="Play">
        {lead !== undefined && <span className="track-lead">{lead}</span>}
        <span className="track-text">
          <span className="track-title">{track.title}</span>
          <span className="muted">
            {artistNames(track.artists)}
            {showAlbum && track.album && ` · ${track.album.title}`}
          </span>
          {status}
        </span>
        <span className="track-time">{track.durationMs ? formatTime(track.durationMs / 1000) : ""}</span>
      </button>
      {actions && <span className="track-actions">{actions}</span>}
    </li>
  );
}

const ICONS = {
  play: "M7 4.5v15l13-7.5z",
  pause: "M6 4.5h4.5v15H6zm7.5 0H18v15h-4.5z",
  next: "M5 4.5v15l10-7.5zM16.5 4.5H19v15h-2.5z",
  previous: "M19 4.5v15L9 12zM5 4.5h2.5v15H5z",
  up: "M12 7l7 8H5z",
  down: "M12 17l7-8H5z",
  remove: "M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z",
  add: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z",
  heart:
    "M12 20.5l-1.3-1.2C6 15 3 12.3 3 8.9 3 6.2 5.1 4 7.8 4c1.5 0 3 .7 4.2 1.9C13.2 4.7 14.7 4 16.2 4 18.9 4 21 6.2 21 8.9c0 3.4-3 6.1-7.7 10.4z",
  heartOutline:
    "M16.2 4c-1.5 0-3 .7-4.2 1.9C10.8 4.7 9.3 4 7.8 4 5.1 4 3 6.2 3 8.9c0 3.4 3 6.1 7.7 10.4l1.3 1.2 1.3-1.2C18 15 21 12.3 21 8.9 21 6.2 18.9 4 16.2 4zm-4.1 14l-.1.1-.1-.1C7.1 13.7 5 11.7 5 8.9 5 7.2 6.2 6 7.8 6c1.2 0 2.5.8 2.9 1.9h2.6c.4-1.1 1.7-1.9 2.9-1.9C17.8 6 19 7.2 19 8.9c0 2.8-2.1 4.8-6.9 9.1z",
  shuffle:
    "M10.6 9.2L5.4 4 4 5.4l5.2 5.2zM14.5 4l2 2L4 18.6 5.4 20 18 7.5l2 2V4zm.3 9.4l-1.4 1.4 3.1 3.1-2 2H20v-5.5l-2 2z",
  repeat: "M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z",
  volume: "M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z",
  mute: "M3 9v6h4l5 5V4L7 9zm18.5 1.4L20.1 9 18 11.1 15.9 9l-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4-2.1-2.1z",
};

export function IconButton(props: {
  icon: keyof typeof ICONS;
  label: string;
  onClick(): void;
  disabled?: boolean;
  primary?: boolean;
  /** Shown highlighted, for toggles that are on. */
  active?: boolean;
}) {
  const classes = ["icon-button", props.primary && "primary", props.active && "active"].filter(Boolean).join(" ");
  return (
    <button
      className={classes}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={ICONS[props.icon]} />
      </svg>
    </button>
  );
}

/** Asks the server which of these tracks are liked, for the heart icons of a list. */
export function useLikeLookup(trackIds: string[]): void {
  const key = trackIds.join("\n");
  useEffect(() => {
    if (trackIds.length > 0) void useLibrary.getState().lookupLikes(trackIds).catch(() => {});
    // `key` stands for the list's contents.
  }, [key]);
}

/** Heart toggle for one track. */
export function LikeButton({ track }: { track: TrackSummary }) {
  const liked = useLibrary((s) => s.liked[track.id] === true);
  const toggle = () => void useLibrary.getState().setLiked(trackSnapshot(track), !liked).catch(() => {});
  return (
    <IconButton
      icon={liked ? "heart" : "heartOutline"}
      label={liked ? "Remove from Liked songs" : "Add to Liked songs"}
      onClick={toggle}
      active={liked}
    />
  );
}
