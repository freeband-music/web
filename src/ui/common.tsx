import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { errorMessage } from "../api/client";
import { useLibrary } from "../store/library";
import type { NowState } from "../store/playback";
import { trackSnapshot } from "../snapshots";
import type { ArtistSummary, TrackSummary } from "../types";
import { Icon, type IconName } from "./icons";
import { toast } from "./overlays";
import { links } from "./router";

export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "";
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "1 song", "2 songs". */
export const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

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
export function Cover({ src, round, icon = "note" }: { src?: string; round?: boolean; icon?: IconName }) {
  const [failed, setFailed] = useState<string>();
  const shown = src && failed !== src;
  return (
    <div className={round ? "cover round" : "cover"}>
      {shown ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} /> : <Icon name={round ? "user" : icon} />}
    </div>
  );
}

/** A playlist cover: 2×2 from four covers, else the first one, else a placeholder. */
export function Mosaic({ covers }: { covers: string[] }) {
  if (covers.length < 4) return <Cover src={covers[0]} />;
  return (
    <div className="cover mosaic">
      {covers.slice(0, 4).map((src, i) => (
        <img key={`${i}-${src}`} src={src} alt="" loading="lazy" />
      ))}
    </div>
  );
}

/** The Liked songs cover. */
export function LikedCover() {
  return (
    <div className="cover liked-cover">
      <Icon name="heart" />
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

/** A small spinning ring for work in progress. */
export function Spinner({ label }: { label?: string }) {
  return <span className="spinner" role={label ? "status" : undefined} aria-label={label} />;
}

/** The visible state of the current track while it is not simply playing. */
export function NowStatus({ now }: { now: NowState }) {
  switch (now.phase) {
    case "resolving":
      return (
        <span className="status busy">
          <Spinner /> Finding a stream…
        </span>
      );
    case "queued":
      return <span className="status">Getting this track ready — try again in a few minutes.</span>;
    case "not_found":
      return <span className="status">{now.message ?? "Not available right now."}</span>;
    case "no_addon":
      return (
        <span className="status">
          No stream add-on installed. <a href={links.addons}>Open Add-ons</a>
        </span>
      );
    case "offline":
      return <span className="status error">Can't reach the server. Press play to try again.</span>;
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

export function IconButton(props: {
  icon: IconName;
  label: string;
  onClick(event: MouseEvent<HTMLButtonElement>): void;
  disabled?: boolean;
  primary?: boolean;
  /** Shown highlighted, for toggles that are on. */
  active?: boolean;
  className?: string;
}) {
  const classes = ["icon-button", props.primary && "primary", props.active && "active", props.className]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      className={classes}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
    >
      <Icon name={props.icon} />
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
  const toggle = () =>
    void useLibrary
      .getState()
      .setLiked(trackSnapshot(track), !liked)
      .then(
        () => toast(liked ? "Removed from Liked songs" : "Added to Liked songs"),
        (error: unknown) => toast(errorMessage(error)),
      );
  return (
    <IconButton
      icon={liked ? "heart" : "heartOutline"}
      label={liked ? "Remove from Liked songs" : "Add to Liked songs"}
      onClick={toggle}
      active={liked}
      className="like"
    />
  );
}

/** Copies text, falling back to a hidden text area where the clipboard API is unavailable (plain HTTP). */
export async function copyText(text: string, done = "Copied to clipboard"): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) {
      toast("Could not copy to the clipboard.");
      return;
    }
  }
  toast(done);
}
