import { useState, type MouseEvent, type ReactNode } from "react";
import { Icon } from "./icons";

/** The round green play button on cards, tiles and page headers. */
export function PlayFab({ onPlay, label = "Play", large }: { onPlay(): void | Promise<void>; label?: string; large?: boolean }) {
  const [busy, setBusy] = useState(false);
  const click = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const result = onPlay();
    if (result instanceof Promise) {
      setBusy(true);
      void result.finally(() => setBusy(false));
    }
  };
  return (
    <button className={large ? "play-fab large" : "play-fab"} onClick={click} aria-label={label} title={label} disabled={busy}>
      <Icon name="play" />
    </button>
  );
}

export interface CardProps {
  href: string;
  /** A `<Cover>`, `<Mosaic>` or `<LikedCover>`. */
  cover: ReactNode;
  title: string;
  subtitle?: ReactNode;
  onPlay?(): void | Promise<void>;
  /** Round artwork and centred text (artists). */
  round?: boolean;
  onOpen?(): void;
  onContextMenu?(event: MouseEvent): void;
}

/** Artwork, title and subtitle; a play button appears on hover. */
export function Card({ href, cover, title, subtitle, onPlay, round, onOpen, onContextMenu }: CardProps) {
  return (
    <a className={round ? "card round" : "card"} href={href} onClick={onOpen} onContextMenu={onContextMenu}>
      <div className="card-art">
        {cover}
        {onPlay && <PlayFab onPlay={onPlay} />}
      </div>
      <span className="card-title" title={title}>
        {title}
      </span>
      {subtitle && <span className="card-subtitle">{subtitle}</span>}
    </a>
  );
}

/** A titled shelf of cards, one row on wide screens and a horizontal scroller on phones. */
export function CardRow({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <section className="shelf">
      <header className="shelf-head">
        <h2>{href ? <a href={href}>{title}</a> : title}</h2>
        {href && (
          <a className="show-all" href={href}>
            Show all
          </a>
        )}
      </header>
      <div className="shelf-cards">{children}</div>
    </section>
  );
}

/** A grid of cards for full lists. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="card-grid">{children}</div>;
}

/** A compact horizontal tile for the home screen's quick-access grid. */
export function QuickTile(props: { href: string; cover: ReactNode; title: string; onPlay?(): void | Promise<void> }) {
  return (
    <a className="quick-tile" href={props.href}>
      {props.cover}
      <span className="quick-title">{props.title}</span>
      {props.onPlay && <PlayFab onPlay={props.onPlay} />}
    </a>
  );
}

/** Filter chips (Search, Library). */
export function Chips<T extends string>(props: {
  options: { value: T; label: string; href?: string }[];
  value: T | null;
  onChange?(value: T | null): void;
  /** Clicking the active chip clears it. */
  clearable?: boolean;
}) {
  return (
    <div className="chips" role="tablist">
      {props.options.map((option) => {
        const active = option.value === props.value;
        const className = active ? "chip active" : "chip";
        if (option.href) {
          return (
            <a key={option.value} className={className} href={option.href} role="tab" aria-selected={active}>
              {option.label}
            </a>
          );
        }
        return (
          <button
            key={option.value}
            className={className}
            role="tab"
            aria-selected={active}
            onClick={() => props.onChange?.(active && props.clearable ? null : option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
