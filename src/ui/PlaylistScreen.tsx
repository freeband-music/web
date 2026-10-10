import { useEffect, useState, type FormEvent } from "react";
import type { PlaylistResponse, PlaylistSummary, PlaylistVisibility } from "../../shared/api";
import { content, errorMessage, playlists } from "../api/client";
import { useLibrary } from "../store/library";
import { usePlayback } from "../store/playback";
import { copyText, count, IconButton, Mosaic } from "./common";
import { useRowDrag } from "./dnd";
import { matchesFilter } from "./libraryModel";
import { Modal, openMenu, toast, useIsPhone, type MenuItem } from "./overlays";
import { ActionBar, formatTotal, PageHeader, SelectionBar, ToggleIcon } from "./page";
import { playTracks } from "./play";
import { deletePlaylistFlow } from "./playlistActions";
import { moveKeys } from "../queue/reorder";
import { links } from "./router";
import { openAddToPlaylist, TrackList } from "./tracks";

export function PlaylistScreen({ id }: { id: string }) {
  const [data, setData] = useState<PlaylistResponse>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    setError(undefined);
    playlists.get(id).then(
      (response) => {
        if (cancelled) return;
        setData(response);
        const albumIds = [...new Set(response.tracks.flatMap((e) => (e.track.album ? [e.track.album.id] : [])))];
        if (albumIds.length > 0) void content.prefetchMeta({ albumIds }).catch(() => {});
      },
      (cause: unknown) => !cancelled && setError(errorMessage(cause)),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <p className="screen status error">{error}</p>;
  if (!data || data.playlist.id !== id) return <p className="screen muted">Loading…</p>;
  return <PlaylistView data={data} setData={setData} />;
}

function EditDetails({ playlist, onClose, onSaved }: { playlist: PlaylistSummary; onClose(): void; onSaved(r: PlaylistResponse): void }) {
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description);
  const [visibility, setVisibility] = useState<PlaylistVisibility>(playlist.visibility);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      onSaved(
        await useLibrary.getState().updatePlaylist(playlist.id, { name: name.trim(), description: description.trim(), visibility }),
      );
      onClose();
    } catch (cause) {
      toast(errorMessage(cause));
      setBusy(false);
    }
  };
  return (
    <Modal title="Edit details" onClose={onClose}>
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>Name</span>
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} autoFocus />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Add an optional description"
          />
        </label>
        <fieldset className="segmented" aria-label="Visibility">
          {(["private", "public"] as const).map((value) => (
            <label key={value} className={visibility === value ? "active" : undefined}>
              <input type="radio" name="visibility" checked={visibility === value} onChange={() => setVisibility(value)} />
              {value === "public" ? "Public" : "Private"}
            </label>
          ))}
        </fieldset>
        <p className="muted small">
          {visibility === "public"
            ? "Anyone on this server can find, open and follow it."
            : "Only you can see it."}
        </p>
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PlaylistView({ data, setData }: { data: PlaylistResponse; setData(r: PlaylistResponse): void }) {
  const { playlist } = data;
  const id = playlist.id;
  const owner = playlist.isOwner;
  const phone = useIsPhone();
  const followed = useLibrary((s) => s.followedPlaylists.some((p) => p.id === id));
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const library = useLibrary.getState();

  const entries = data.tracks;
  const shown = filter
    ? entries.filter((e) => matchesFilter(filter, e.track.title, ...e.track.artists.map((a) => a.name), e.track.album?.title))
    : entries;
  const tracks = entries.map((e) => e.track);
  const context = { type: "playlist", id, name: playlist.name, image: playlist.covers[0] } as const;
  const rows = shown.map((e) => ({ key: e.entryId, track: e.track }));
  const keys = rows.map((r) => r.key);

  // Drop selected keys that are gone (removed, or hidden by the filter).
  const visible = new Set(keys);
  const selection = [...selected].some((k) => !visible.has(k)) ? new Set([...selected].filter((k) => visible.has(k))) : selected;
  const chosen = rows.filter((r) => selection.has(r.key));

  const act = (action: () => Promise<PlaylistResponse | void>, done?: string) =>
    void action().then(
      (response) => {
        if (response) setData(response);
        if (done) toast(done);
      },
      (cause: unknown) => toast(errorMessage(cause)),
    );

  function move(moved: string[], beforeKey: string | null) {
    const order = moveKeys(
      entries.map((e) => e.entryId),
      moved,
      beforeKey,
    );
    const byKey = new Map(entries.map((e) => [e.entryId, e]));
    const before = data;
    setData({ ...data, tracks: order.map((k) => byKey.get(k)!) });
    library.moveInPlaylist(id, moved, beforeKey).then(setData, (cause: unknown) => {
      setData(before);
      toast(errorMessage(cause));
    });
  }

  const rowProps = useRowDrag({ keys, selected: selection, enabled: owner && !filter && entries.length > 1, onMove: move });

  const remove = (keysToRemove: string[]) => {
    setSelected(new Set());
    act(
      () => library.removeFromPlaylist(id, keysToRemove),
      keysToRemove.length === 1 ? "Removed from playlist" : `${keysToRemove.length} tracks removed`,
    );
  };

  const copyLink = () => void copyText(window.location.origin + links.playlist(id), "Link copied");
  const toggleVisibility = () =>
    act(
      () => library.updatePlaylist(id, { visibility: playlist.visibility === "public" ? "private" : "public" }),
      playlist.visibility === "public" ? "Playlist is now private" : "Playlist is now public",
    );
  const menuItems: MenuItem[] = owner
    ? [
        { label: "Edit details", icon: "edit", onSelect: () => setEditing(true) },
        {
          label: playlist.visibility === "public" ? "Make private" : "Make public",
          icon: playlist.visibility === "public" ? "lock" : "globe",
          onSelect: toggleVisibility,
        },
        { label: "Copy link", icon: "link", onSelect: copyLink },
        "separator",
        { label: "Delete", icon: "remove", danger: true, onSelect: () => void deletePlaylistFlow(playlist) },
      ]
    : [
        { label: "Add to queue", icon: "queue", onSelect: () => usePlayback.getState().addToQueue(tracks, context) },
        { label: "Copy link", icon: "link", onSelect: copyLink },
      ];

  return (
    <div className="screen">
      <PageHeader
        cover={<Mosaic covers={playlist.covers} />}
        kind={playlist.visibility === "public" ? "Public playlist" : "Private playlist"}
        title={playlist.name}
        meta={
          <>
            {playlist.description && <p className="page-description">{playlist.description}</p>}
            <strong>
              <a href={links.user(playlist.owner.username)}>{playlist.owner.displayName}</a>
            </strong>
            <span>
              {" "}
              · {count(playlist.trackCount, "song")}
              {playlist.durationMs > 0 && `, ${formatTotal(playlist.durationMs)}`}
            </span>
          </>
        }
      />
      <ActionBar
        onPlay={tracks.length ? () => playTracks(tracks, context) : undefined}
        onShuffle={tracks.length ? () => playTracks(tracks, context, { shuffle: true }) : undefined}
      >
        {!owner && (
          <ToggleIcon
            on={followed}
            onLabel="Remove from Your Library"
            offLabel="Save to Your Library"
            onClick={() =>
              act(
                () => library.setPlaylistFollowed(playlist, !followed),
                followed ? "Removed from Your Library" : "Saved to Your Library",
              )
            }
          />
        )}
        <IconButton icon="more" label="More options" className="large" onClick={(event) => openMenu(event.currentTarget, { items: menuItems })} />
        {entries.length > 0 && (
          <input
            type="search"
            className="filter-box"
            placeholder="Search in playlist"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter"
          />
        )}
      </ActionBar>
      <SelectionBar count={chosen.length} onClear={() => setSelected(new Set())}>
        <button
          className="button small"
          onClick={() => {
            usePlayback.getState().addToQueue(chosen.map((r) => r.track), context);
            toast(chosen.length === 1 ? "Added to queue" : `${chosen.length} tracks added to queue`);
          }}
        >
          Add to queue
        </button>
        <button className="button small" onClick={(event) => openAddToPlaylist(event.currentTarget, chosen.map((r) => r.track))}>
          Add to playlist
        </button>
        {owner && (
          <button className="button small" onClick={() => remove(chosen.map((r) => r.key))}>
            Remove
          </button>
        )}
      </SelectionBar>
      {entries.length === 0 &&
        (owner ? (
          <div className="empty-hint">
            <h2>Let’s find something for your playlist</h2>
            <p className="muted">Search for songs, then use “Add to playlist” in a track’s menu.</p>
            <a className="button primary" href={links.search}>
              Find songs
            </a>
          </div>
        ) : (
          <p className="muted">This playlist is empty.</p>
        ))}
      {entries.length > 0 && shown.length === 0 && <p className="muted">No songs match “{filter}”.</p>}
      <TrackList
        rows={rows}
        onPlay={(index) => playTracks(tracks, context, { index: entries.indexOf(shown[index]) })}
        context={context}
        showCover
        showAlbum
        showHeader
        selected={selection}
        onSelectionChange={setSelected}
        onRemove={owner ? (removed) => remove(removed.map((r) => r.key)) : undefined}
        dragHandle={owner && phone && !filter && entries.length > 1}
        rowProps={(row) => rowProps(row.key)}
      />
      {editing && <EditDetails playlist={playlist} onClose={() => setEditing(false)} onSaved={setData} />}
    </div>
  );
}
