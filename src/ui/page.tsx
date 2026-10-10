import type { ReactNode } from "react";
import { PlayFab } from "./cards";
import { IconButton } from "./common";
import type { IconName } from "./icons";

/** The big header of album, artist, playlist and Liked songs pages. */
export function PageHeader(props: { cover: ReactNode; kind: string; title: string; meta?: ReactNode; round?: boolean }) {
  return (
    <header className={props.round ? "page-header round" : "page-header"}>
      <div className="page-cover">{props.cover}</div>
      <div className="page-text">
        <span className="page-kind">{props.kind}</span>
        <h1 className={props.title.length > 28 ? "page-title long" : "page-title"}>{props.title}</h1>
        {props.meta && <div className="page-meta">{props.meta}</div>}
      </div>
    </header>
  );
}

/** Play, shuffle, then page-specific toggles. */
export function ActionBar(props: {
  onPlay?(): void | Promise<void>;
  onShuffle?(): void;
  children?: ReactNode;
}) {
  return (
    <div className="action-bar">
      {props.onPlay && <PlayFab onPlay={props.onPlay} large />}
      {props.onShuffle && <IconButton icon="shuffle" label="Shuffle play" onClick={props.onShuffle} className="large" />}
      {props.children}
    </div>
  );
}

/** A large outline toggle in the action bar (Save, Follow). */
export function ToggleIcon(props: { on: boolean; onLabel: string; offLabel: string; onClick(): void; icons?: [IconName, IconName] }) {
  const [on, off] = props.icons ?? ["checkCircle", "addCircle"];
  return (
    <IconButton
      icon={props.on ? on : off}
      label={props.on ? props.onLabel : props.offLabel}
      onClick={props.onClick}
      active={props.on}
      className="large"
    />
  );
}

/** "1 h 5 min" or "42 min 10 s" for a total duration. */
export function formatTotal(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${minutes} min ${Math.floor((ms % 60_000) / 1000)} s`;
}

/** Shown above a list while rows are selected: a count, actions and Clear. */
export function SelectionBar(props: { count: number; onClear(): void; children?: ReactNode }) {
  if (props.count === 0) return null;
  return (
    <div className="selection-bar" role="toolbar" aria-label="Selected tracks">
      <strong>{props.count} selected</strong>
      <span className="selection-actions">{props.children}</span>
      <button className="button ghost small" onClick={props.onClear}>
        Clear
      </button>
    </div>
  );
}
