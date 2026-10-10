import { useEffect, useState, type ReactNode } from "react";
import type { NowState } from "../store/playback";
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
        setState({ key, value: { loading: false, error: error instanceof Error ? error.message : String(error) } }),
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
};

export function IconButton(props: {
  icon: keyof typeof ICONS;
  label: string;
  onClick(): void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      className={props.primary ? "icon-button primary" : "icon-button"}
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
