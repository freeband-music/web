// Track lists with play state, selection and the track menu.

import { useRef, useState, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { PlayContext, TrackSnapshot } from "../../shared/api";
import { errorMessage } from "../api/client";
import { currentItem } from "../queue/queue";
import { useLibrary } from "../store/library";
import { usePlayback } from "../store/playback";
import { ArtistLinks, Cover, formatTime, IconButton, LikeButton, Mosaic, NowStatus, useLikeLookup } from "./common";
import { Icon } from "./icons";
import { openMenu, promptDialog, toast, useIsPhone, type MenuAnchor, type MenuContext, type MenuItem, type MenuPage } from "./overlays";
import { links } from "./router";
import { nextSelection, type SelectMode } from "./selection";

// The track menu

export interface TrackMenuOptions {
  /** Adds "Remove from this playlist" (the playlist page passes it). */
  onRemove?(): void;
}

function AddToPlaylist({ tracks, context }: { tracks: TrackSnapshot[]; context: MenuContext }) {
  const own = useLibrary((s) => s.playlists);
  const [filter, setFilter] = useState("");
  const shown = own.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()));

  async function addTo(id: string, name: string) {
    context.close();
    try {
      await useLibrary.getState().addToPlaylist(id, tracks);
      toast(`Added to ${name}`);
    } catch (error) {
      toast(errorMessage(error));
    }
  }

  async function createNew() {
    context.close();
    const name = await promptDialog({
      title: "New playlist",
      label: "Name",
      value: tracks.length === 1 ? tracks[0].title : "",
      confirmLabel: "Create",
    });
    if (!name) return;
    try {
      const { playlist } = await useLibrary.getState().createPlaylist({ name, tracks });
      toast(`Added to ${playlist.name}`);
    } catch (error) {
      toast(errorMessage(error));
    }
  }

  return (
    <div className="menu-playlists">
      <input
        type="search"
        className="menu-search"
        placeholder="Find a playlist"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        autoFocus={!window.matchMedia("(pointer: coarse)").matches}
      />
      <button className="menu-item" onClick={() => void createNew()}>
        <Icon name="add" />
        <span className="menu-label">New playlist</span>
      </button>
      <hr className="menu-separator" />
      <div className="menu-scroll">
        {shown.map((p) => (
          <button key={p.id} className="menu-item" onClick={() => void addTo(p.id, p.name)}>
            <span className="menu-thumb">
              <Mosaic covers={p.covers} />
            </span>
            <span className="menu-label">{p.name}</span>
          </button>
        ))}
        {shown.length === 0 && <p className="muted menu-empty">{own.length ? "No matching playlists." : "No playlists yet."}</p>}
      </div>
    </div>
  );
}

function TrackMenuHeader({ tracks }: { tracks: TrackSnapshot[] }) {
  const [first] = tracks;
  return (
    <div className="menu-track">
      <span className="menu-thumb">
        <Cover src={first.album?.cover} />
      </span>
      <span className="menu-track-text">
        <strong>{tracks.length === 1 ? first.title : `${tracks.length} tracks`}</strong>
        {tracks.length === 1 && <span className="muted">{first.artists.map((a) => a.name).join(", ")}</span>}
      </span>
    </div>
  );
}

async function likeAll(tracks: TrackSnapshot[], liked: boolean) {
  try {
    await useLibrary.getState().lookupLikes(tracks.map((t) => t.id));
    await Promise.all(tracks.map((t) => useLibrary.getState().setLiked(t, liked)));
    toast(liked ? "Added to Liked songs" : "Removed from Liked songs");
  } catch (error) {
    toast(errorMessage(error));
  }
}

/** The menu for one or more tracks. */
export function trackMenuPage(tracks: TrackSnapshot[], options: TrackMenuOptions = {}): MenuPage {
  const single = tracks.length === 1 ? tracks[0] : undefined;
  const liked = single ? useLibrary.getState().liked[single.id] === true : false;
  const playback = usePlayback.getState();
  const count = tracks.length === 1 ? "" : ` (${tracks.length})`;
  const items: MenuItem[] = [
    {
      label: "Add to playlist",
      icon: "add",
      page: () => ({ title: "Add to playlist", render: (context) => <AddToPlaylist tracks={tracks} context={context} /> }),
    },
  ];
  if (options.onRemove) items.push({ label: "Remove from this playlist", icon: "remove", onSelect: options.onRemove });
  items.push(
    {
      label: liked ? "Remove from Liked songs" : "Save to Liked songs",
      icon: liked ? "heart" : "heartOutline",
      onSelect: () => void likeAll(tracks, !liked),
    },
    "separator",
    {
      label: `Play next${count}`,
      icon: "next",
      onSelect: () => {
        playback.playNext(tracks);
        toast(tracks.length === 1 ? "Playing next" : `${tracks.length} tracks playing next`);
      },
    },
    {
      label: `Add to queue${count}`,
      icon: "queue",
      onSelect: () => {
        playback.addToQueue(tracks);
        toast(tracks.length === 1 ? "Added to queue" : `${tracks.length} tracks added to queue`);
      },
    },
  );
  if (single) {
    const { artists, album } = single;
    if (artists.length > 0 || album) items.push("separator");
    if (artists.length === 1) items.push({ label: "Go to artist", icon: "user", href: links.artist(artists[0].id) });
    if (artists.length > 1) {
      items.push({
        label: "Go to artist",
        icon: "user",
        page: () => ({
          title: "Artists",
          items: artists.map((a) => ({ label: a.name, icon: "user", href: links.artist(a.id) })),
        }),
      });
    }
    if (album) items.push({ label: "Go to album", icon: "album", href: links.album(album.id) });
  }
  return { header: <TrackMenuHeader tracks={tracks} />, items };
}

export function openTrackMenu(anchor: MenuAnchor, tracks: TrackSnapshot[], options?: TrackMenuOptions): void {
  if (tracks.length > 0) openMenu(anchor, trackMenuPage(tracks, options));
}

// The list

export interface TrackListRow {
  /** Unique in the list (a playlist entry ID, or index and track ID). */
  key: string;
  track: TrackSnapshot;
  /** Shown in the leading column instead of the position (a track number). */
  lead?: ReactNode;
}

export interface TrackListProps {
  rows: TrackListRow[];
  onPlay(index: number): void;
  /** The context these rows play in; the playing row is highlighted when the current queue item came from it. */
  context?: PlayContext;
  showCover?: boolean;
  showAlbum?: boolean;
  showHeader?: boolean;
  /** Controlled selection (row keys). Without it the list keeps its own. */
  selected?: ReadonlySet<string>;
  onSelectionChange?(keys: Set<string>): void;
  /** Adds "Remove from this playlist" to the menu, for the targeted rows. */
  onRemove?(rows: TrackListRow[]): void;
  /** Extra attributes per row, for drag and drop. */
  rowProps?(row: TrackListRow, index: number): HTMLAttributes<HTMLLIElement>;
}

const sameContext = (a: PlayContext, b: PlayContext) => a.type === b.type && a.id === b.id && a.name === b.name;

function useCurrentKey(rows: TrackListRow[], context: PlayContext | undefined): string | null {
  const item = usePlayback((s) => currentItem(s.queue));
  if (!item || !context || !sameContext(item.context, context)) return null;
  return rows.find((r) => r.track.id === item.track.id)?.key ?? null;
}

function isInteractive(target: EventTarget) {
  return target instanceof Element && target.closest("a, button, input") !== null;
}

export function TrackList(props: TrackListProps) {
  const { rows, onPlay, showCover, showAlbum, showHeader } = props;
  const phone = useIsPhone();
  const [ownSelection, setOwnSelection] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<number | null>(null);
  const selected = props.selected ?? ownSelection;
  const setSelected = (keys: Set<string>) => {
    if (props.onSelectionChange) props.onSelectionChange(keys);
    if (!props.selected) setOwnSelection(keys);
  };
  const currentKey = useCurrentKey(rows, props.context);
  const now = usePlayback((s) => s.now);
  const playing = usePlayback((s) => s.player.status === "playing" || s.player.status === "loading");
  useLikeLookup(rows.map((r) => r.track.id));
  const keys = rows.map((r) => r.key);

  function select(index: number, mode: SelectMode) {
    setSelected(nextSelection(selected, keys, index, anchor.current, mode));
    if (mode !== "range") anchor.current = index;
  }

  /** The rows a menu opened on `index` acts on: the selection if the row is in it. */
  function targets(index: number): TrackListRow[] {
    const row = rows[index];
    if (selected.has(row.key)) return rows.filter((r) => selected.has(r.key));
    select(index, "single");
    return [row];
  }

  function menu(anchorAt: MenuAnchor, index: number) {
    const chosen = targets(index);
    openTrackMenu(
      anchorAt,
      chosen.map((r) => r.track),
      { onRemove: props.onRemove && (() => props.onRemove?.(chosen)) },
    );
  }

  function click(event: MouseEvent, index: number) {
    if (isInteractive(event.target)) return;
    if (phone) {
      onPlay(index);
      return;
    }
    select(index, event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "single");
  }

  function key(event: KeyboardEvent, index: number) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") onPlay(index);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const sibling = event.key === "ArrowDown" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling;
      (sibling as HTMLElement | null)?.focus();
    }
  }

  const classes = ["tracklist", showAlbum && "with-album", showCover && "with-cover"].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      {showHeader && (
        <div className="trow trow-head" aria-hidden="true">
          <span className="trow-lead">#</span>
          <span>Title</span>
          {showAlbum && <span className="trow-album">Album</span>}
          <span />
          <span className="trow-time">
            <Icon name="clock" />
          </span>
          <span />
        </div>
      )}
      <ul role="list">
        {rows.map((row, index) => {
          const { track } = row;
          const current = row.key === currentKey;
          const classNames = ["trow", current && "current", selected.has(row.key) && "selected"].filter(Boolean).join(" ");
          return (
            <li
              key={row.key}
              className={classNames}
              tabIndex={0}
              aria-selected={selected.has(row.key)}
              onClick={(event) => click(event, index)}
              onDoubleClick={(event) => !isInteractive(event.target) && onPlay(index)}
              onContextMenu={(event) => {
                event.preventDefault();
                menu({ x: event.clientX, y: event.clientY }, index);
              }}
              onKeyDown={(event) => key(event, index)}
              {...props.rowProps?.(row, index)}
            >
              <span className="trow-lead">
                <span className="trow-number">
                  {current && playing ? <span className="eq" aria-label="Playing" /> : (row.lead ?? index + 1)}
                </span>
                <button className="trow-play" onClick={() => (current ? usePlayback.getState().toggle() : onPlay(index))} aria-label={current && playing ? "Pause" : `Play ${track.title}`}>
                  <Icon name={current && playing ? "pause" : "play"} />
                </button>
              </span>
              <span className="trow-main">
                {showCover && (
                  <span className="trow-cover">
                    <Cover src={track.album?.cover} />
                  </span>
                )}
                <span className="trow-text">
                  <span className="trow-title">{track.title}</span>
                  <span className="trow-sub">
                    <ArtistLinks artists={track.artists} />
                  </span>
                  {current && <NowStatus now={now} />}
                </span>
              </span>
              {showAlbum && (
                <span className="trow-album">{track.album && <a href={links.album(track.album.id)}>{track.album.title}</a>}</span>
              )}
              <span className="trow-like">
                <LikeButton track={track} />
              </span>
              <span className="trow-time">{track.durationMs ? formatTime(track.durationMs / 1000) : ""}</span>
              <span className="trow-more">
                <IconButton icon="more" label={`More options for ${track.title}`} onClick={(event) => menu(event.currentTarget, index)} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
