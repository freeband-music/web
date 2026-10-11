import { useEffect, useState } from "react";
import { content } from "../api/client";
import { prefetchAgain, usePlayback, type QueueItem } from "../store/playback";
import { STATUS_LIMIT, isUnavailable, summarize, useQueueStatus } from "../store/queueStatus";
import { trackSummary } from "../snapshots";
import { QueueStatusDot } from "./QueueStatusDot";
import { useRowDrag } from "./dnd";
import { toast, useIsPhone } from "./overlays";
import { SelectionBar } from "./page";
import { createPlaylistFlow } from "./playlistActions";
import { openAddToPlaylist, TrackList, type TrackListRow } from "./tracks";

const toRows = (items: QueueItem[]): TrackListRow[] => items.map((item) => ({ key: item.key, track: item.track }));

const POLL_MS = 3000;

/** Polls the status of the current and upcoming tracks while the queue is shown. */
function usePolledStatus(trackIds: string[]) {
  const signature = trackIds.join("\n");
  useEffect(() => {
    const ids = signature ? signature.split("\n") : [];
    const { load } = useQueueStatus.getState();
    void load(ids);
    const timer = setInterval(() => {
      if (!document.hidden) void load(ids);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [signature]);
}

/** Looks up one track again, then refreshes its status. */
async function retry(item: QueueItem) {
  try {
    await content.stream({ track: trackSummary(item.track), allowQueue: false });
  } catch {
    // The status below says what happened.
  }
  await useQueueStatus.getState().load([item.track.id]);
}

export function QueueScreen() {
  const queue = usePlayback((s) => s.queue);
  const shuffle = usePlayback((s) => s.shuffle);
  const { jumpTo, moveItems, removeItems, clear } = usePlayback.getState();
  const phone = useIsPhone();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { items, current } = queue;
  const nowItem = items[current];
  const start = current < 0 ? 0 : current + 1;
  const upNext = items.slice(start);
  const earlier = current < 0 ? [] : items.slice(0, current);
  const keys = new Set(items.map((i) => i.key));
  const selection = [...selected].every((k) => keys.has(k)) ? selected : new Set([...selected].filter((k) => keys.has(k)));
  const chosen = items.filter((i) => selection.has(i.key));

  const watched = [...(nowItem ? [nowItem] : []), ...upNext].slice(0, STATUS_LIMIT);
  usePolledStatus(watched.map((i) => i.track.id));
  const statuses = useQueueStatus((s) => s.statuses);
  const counts = summarize(upNext.slice(0, STATUS_LIMIT).map((i) => statuses[i.track.id]?.state));
  const unavailable = upNext.filter((i) => isUnavailable(statuses[i.track.id]?.state));
  const anyExpired = watched.some((i) => statuses[i.track.id]?.state === "expired");
  useEffect(() => {
    if (anyExpired) prefetchAgain();
  }, [anyExpired]);
  const withStatus = (list: QueueItem[]): TrackListRow[] =>
    list.map((item) => ({
      key: item.key,
      track: item.track,
      badge: <QueueStatusDot status={statuses[item.track.id]} onRetry={() => void retry(item)} />,
    }));

  const nextKeys = upNext.map((i) => i.key);
  const earlierKeys = earlier.map((i) => i.key);
  const dragNext = useRowDrag({ keys: nextKeys, selected: selection, enabled: upNext.length > 1, onMove: moveItems });
  // The earlier part ends at the current item, not at the end of the queue.
  const dragEarlier = useRowDrag({
    keys: earlierKeys,
    selected: selection,
    enabled: earlier.length > 1,
    onMove: (moved, before) => moveItems(moved, before ?? nowItem?.key ?? null),
  });

  const remove = (rows: TrackListRow[]) => {
    setSelected(new Set());
    removeItems(rows.map((r) => r.key));
    toast(rows.length === 1 ? "Removed from queue" : `${rows.length} tracks removed from queue`);
  };
  const common = {
    showCover: true,
    showAlbum: true,
    selected: selection,
    onSelectionChange: setSelected,
    onRemove: remove,
    removeLabel: "Remove from queue",
  };

  return (
    <div className="screen">
      <header className="title-row">
        <h1>Queue</h1>
        {items.length > 0 && (
          <span className="title-actions">
            <button className="button small" onClick={() => void createPlaylistFlow(items.map((i) => i.track))}>
              Save as playlist
            </button>
            <button
              className="button small ghost"
              onClick={() => {
                setSelected(new Set());
                clear();
              }}
            >
              Clear queue
            </button>
          </span>
        )}
      </header>
      {items.length === 0 && <p className="muted">The queue is empty. Search for something to play.</p>}
      <SelectionBar count={chosen.length} onClear={() => setSelected(new Set())}>
        <button className="button small" onClick={(event) => openAddToPlaylist(event.currentTarget, chosen.map((i) => i.track))}>
          Add to playlist
        </button>
        <button className="button small" onClick={() => remove(toRows(chosen))}>
          Remove
        </button>
      </SelectionBar>
      {upNext.length > 0 && (
        <p className="queue-summary muted small">
          <span>
            {[
              `${counts.ready} ready`,
              counts.unavailable && `${counts.unavailable} unavailable`,
              counts.error && `${counts.error} failed`,
              counts.checking && `${counts.checking} checking`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {unavailable.length > 0 && (
            <button className="button small ghost" onClick={() => remove(toRows(unavailable))}>
              Remove unavailable
            </button>
          )}
        </p>
      )}
      {nowItem && (
        <section>
          <h2 className="queue-heading">Now playing</h2>
          <TrackList {...common} rows={withStatus([nowItem])} onPlay={() => jumpTo(current)} context={nowItem.context} />
        </section>
      )}
      {upNext.length > 0 && (
        <section>
          <h2 className="queue-heading">
            Next up{shuffle && <span className="muted small"> · shuffled</span>}
          </h2>
          <TrackList
            {...common}
            rows={withStatus(upNext)}
            onPlay={(index) => jumpTo(start + index)}
            dragHandle={phone && upNext.length > 1}
            rowProps={(row) => dragNext(row.key)}
          />
        </section>
      )}
      {earlier.length > 0 && (
        <section>
          <h2 className="queue-heading">Earlier in the queue</h2>
          <TrackList
            {...common}
            className="earlier"
            rows={toRows(earlier)}
            onPlay={(index) => jumpTo(index)}
            dragHandle={phone && earlier.length > 1}
            rowProps={(row) => dragEarlier(row.key)}
          />
        </section>
      )}
    </div>
  );
}
