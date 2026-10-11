import { create } from "zustand";
import {
  PLAY_THRESHOLD_MS,
  type PlayContext,
  type PlaybackState as SyncedPlayback,
  type PlaybackUpdate,
  type TrackSnapshot,
} from "../../shared/api";
import { ApiError, content, errorMessage, history, me } from "../api/client";
import { Player, type PlayerState } from "../player/player";
import * as q from "../queue/queue";
import { toResolveResult, type PlayableStream } from "../resolver/resolver";
import { moveKeys } from "../queue/reorder";
import { albumSnapshot, trackSnapshot, trackSummary } from "../snapshots";
import type { Album } from "../types";
import { useSettings } from "./settings";

const SKIP_DELAY_MS = 3000;
const SAVE_DELAY_MS = 2000;
const POSITION_SAVE_MS = 10_000;
const PREFETCH_DELAY_MS = 500;
/** The next track starts loading this many seconds before the current one ends. */
const PRELOAD_BEFORE_END_S = 30;
/** The server keeps at most this many queued tracks. */
export const MAX_QUEUE = 1000;

/** Volume is kept per device; the account's last volume only seeds a new device. */
const VOLUME_KEY = "freeband.volume";

function deviceVolume(): { volume: number; muted: boolean } | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(VOLUME_KEY) ?? "null") as { volume?: unknown; muted?: unknown } | null;
    if (saved && typeof saved.volume === "number" && typeof saved.muted === "boolean") {
      return { volume: Math.min(Math.max(saved.volume, 0), 1), muted: saved.muted };
    }
  } catch {
    // Storage unavailable or unreadable: use the account's volume.
  }
  return null;
}

function saveDeviceVolume(volume: number, muted: boolean): void {
  try {
    window.localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume, muted }));
  } catch {
    // Storage unavailable: the volume lasts until the page is reloaded.
  }
}

export type Repeat = q.Repeat;

export interface QueueItem {
  /** Unique per queue entry, so a track can be queued twice. */
  key: string;
  track: TrackSnapshot;
  /** Where the track was queued from; recorded with each play. */
  context: PlayContext;
}

/** What is happening with the current queue item. */
export type NowState =
  | { phase: "idle" }
  | { phase: "resolving" }
  | { phase: "playing"; stream: PlayableStream }
  | { phase: "queued" }
  | { phase: "not_found"; message?: string }
  | { phase: "no_addon" }
  /** The server could not be reached; playing again retries. */
  | { phase: "offline" }
  | { phase: "error"; message: string };

interface PlaybackState {
  queue: q.Queue<QueueItem>;
  shuffle: boolean;
  repeat: Repeat;
  volume: number;
  muted: boolean;
  now: NowState;
  player: PlayerState;

  /** Replaces the queue with a list (an album, playlist or artist) and plays from `index`. */
  playList(tracks: TrackSnapshot[], index: number, context: PlayContext): void;
  playAlbum(album: Album, index: number): void;
  /** Appends a track and plays it (search results). */
  playTrack(track: TrackSnapshot, context?: PlayContext): void;
  playNext(tracks: TrackSnapshot[], context?: PlayContext): void;
  addToQueue(tracks: TrackSnapshot[], context?: PlayContext): void;
  jumpTo(index: number): void;
  remove(index: number): void;
  move(index: number, delta: -1 | 1): void;
  /** Moves items (by key) to before `beforeKey`, or to the end when it is null. */
  moveItems(keys: string[], beforeKey: string | null): void;
  removeItems(keys: string[]): void;
  clear(): void;

  toggle(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  /** Seeks relative to the current position. */
  seekBy(seconds: number): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  setShuffle(shuffle: boolean): void;
  setRepeat(repeat: Repeat): void;
  /** off → all → one → off. */
  cycleRepeat(): void;

  /** Restores the user's synced queue (paused at the saved position) and starts syncing. */
  load(): Promise<void>;
  /** Stops playback and forgets the queue (on sign-out). */
  reset(): void;
}

let keyCounter = 0;
function toItem(track: TrackSnapshot, context: PlayContext): QueueItem {
  keyCounter += 1;
  return { key: `${Date.now().toString(36)}-${keyCounter}`, track, context };
}

const QUEUE_CONTEXT: PlayContext = { type: "queue" };
const SEARCH_CONTEXT: PlayContext = { type: "search" };

export const usePlayback = create<PlaybackState>()((set, get) => {
  /** Bumped whenever the current item changes, to drop stale async results. */
  let generation = 0;
  let skipTimer: ReturnType<typeof setTimeout> | undefined;
  let streams: PlayableStream[] = [];
  let streamIndex = 0;
  /** Items skipped in a row because they could not play; stops endless skipping. */
  let failedInARow = 0;
  /** Where to start the current item when it is first played (a restored queue). */
  let resumeAt = 0;
  /** Seconds of the current play-through actually listened to, and whether it was recorded. */
  let played = 0;
  let lastPosition = 0;
  let recorded = false;
  /** The generation whose next track has been preloaded (or is being). */
  let preloadedFor = -1;

  const player = new Player({
    onState(state) {
      const before = get().player;
      if (state.status === "playing") {
        const delta = state.position - lastPosition;
        if (delta > 0 && delta < 1.5) played += delta;
        if (!recorded && played * 1000 >= PLAY_THRESHOLD_MS) recordPlay();
        if (state.duration > 0 && state.duration - state.position <= PRELOAD_BEFORE_END_S) preloadNext();
      }
      lastPosition = state.position;
      set({ player: state });
      if (before.status === "playing" && state.status === "paused") sync.saveSoon(0);
    },
    onEnded() {
      if (!recorded && played > 0) recordPlay();
      advance(true);
    },
    onError() {
      streamIndex += 1;
      if (streamIndex < streams.length) playStream(0);
      else fail({ phase: "error", message: "None of the available sources could be played." });
    },
  });

  function recordPlay() {
    recorded = true;
    const item = q.currentItem(get().queue);
    if (!item) return;
    void history
      .recordPlay({ track: item.track, msPlayed: Math.round(played * 1000), context: item.context })
      .catch(() => {});
  }

  /**
   * Loads the track that will play after the current one ends, so the change is
   * immediate. Asking for its stream here also lets the server fetch its media link.
   */
  function preloadNext() {
    if (preloadedFor === generation) return;
    preloadedFor = generation;
    const mine = generation;
    const { queue, repeat } = get();
    const index = q.nextIndex(queue, repeat, true);
    if (index === null || index === queue.current) return;
    const item = queue.items[index];
    content
      .stream({ track: trackSummary(item.track) })
      .then((response) => {
        if (mine !== generation) return;
        const result = toResolveResult(response.result, useSettings.getState().quality);
        if (result.kind === "ok") player.preload(result.streams[0].url);
      })
      .catch(() => {});
  }

  function resetPlayCount() {
    played = 0;
    lastPosition = 0;
    recorded = false;
  }

  function playStream(startAt: number) {
    const stream = streams[streamIndex];
    set({ now: { phase: "playing", stream } });
    player.play(stream.url, startAt);
  }

  /**
   * Shows why the current item cannot play, then skips it after a moment.
   * Skipping would not help without a stream add-on or without the server.
   */
  function fail(now: NowState) {
    set({ now });
    if (now.phase === "no_addon" || now.phase === "offline") return;
    failedInARow += 1;
    if (failedInARow >= get().queue.items.length) return;
    const mine = generation;
    skipTimer = setTimeout(() => {
      if (mine === generation) advance(false);
    }, SKIP_DELAY_MS);
  }

  /** Moves on after the current item; `auto` when it finished on its own. */
  function advance(auto: boolean) {
    const { queue, repeat } = get();
    const index = q.nextIndex(queue, repeat, auto);
    if (index === null) return;
    if (auto && index === queue.current && player.loaded) {
      resetPlayCount();
      player.seek(0);
      player.resume();
      return;
    }
    void startAt(q.jump(queue, index));
  }

  function halt() {
    generation += 1;
    clearTimeout(skipTimer);
    streams = [];
    resumeAt = 0;
    player.stop();
    player.clearPreload();
    player.setMediaInfo(null);
    set({ now: { phase: "idle" } });
  }

  function showMedia(item: QueueItem) {
    player.setMediaInfo({
      title: item.track.title,
      artist: item.track.artists.map((a) => a.name).join(", "),
      album: item.track.album?.title,
      artwork: item.track.album?.cover,
    });
  }

  /** Makes the queue's current item the playing one. */
  async function startAt(queue: q.Queue<QueueItem>, from = 0) {
    const item = q.currentItem(queue);
    if (!item) {
      set({ queue });
      halt();
      return;
    }
    const mine = ++generation;
    clearTimeout(skipTimer);
    streams = [];
    resumeAt = 0;
    resetPlayCount();
    lastPosition = from;
    player.stop();
    set({ queue, now: { phase: "resolving" } });
    showMedia(item);

    let response;
    try {
      response = await content.stream({ track: trackSummary(item.track) });
    } catch (error) {
      if (mine !== generation) return;
      if (error instanceof ApiError && error.code === "network") fail({ phase: "offline" });
      else fail({ phase: "error", message: errorMessage(error) });
      return;
    }
    if (mine !== generation) return;
    const result = toResolveResult(response.result, useSettings.getState().quality);
    if (result.kind === "ok") {
      failedInARow = 0;
      streams = result.streams;
      streamIndex = 0;
      playStream(from);
    } else if (result.kind === "error") {
      fail({ phase: "error", message: `Stream add-on error: ${result.message}` });
    } else if (result.kind === "not_found") {
      fail({ phase: "not_found", message: result.message });
    } else {
      fail({ phase: result.kind });
    }
  }

  /** Changes the queue without touching the current item. */
  function setQueue(queue: q.Queue<QueueItem>) {
    set({ queue, shuffle: queue.order !== undefined });
  }

  const room = (tracks: TrackSnapshot[]) => tracks.slice(0, Math.max(0, MAX_QUEUE - get().queue.items.length));

  const actions = {
    toggle() {
      const { player: state, queue } = get();
      if (state.status === "playing" || state.status === "loading") player.pause();
      else if (player.loaded) player.resume();
      else if (queue.current >= 0) void startAt(queue, resumeAt);
      else if (queue.items.length > 0) void startAt(q.jump(queue, 0));
    },
    next: () => advance(false),
    previous() {
      const { queue, repeat } = get();
      const back = get().player.position > 3 ? null : q.previousIndex(queue, repeat);
      if (back !== null) void startAt(q.jump(queue, back));
      else player.seek(0);
    },
    seek: (seconds: number) => player.seek(Math.max(0, seconds)),
  };

  player.setMediaActions({
    play: () => {
      if (get().player.status !== "playing") actions.toggle();
    },
    pause: () => player.pause(),
    next: actions.next,
    previous: actions.previous,
    seek: actions.seek,
  });

  return {
    queue: q.emptyQueue(),
    shuffle: false,
    repeat: "off",
    volume: 1,
    muted: false,
    now: { phase: "idle" },
    player: { status: "idle", position: 0, duration: 0 },
    ...actions,

    playList(tracks, index, context) {
      let queue = q.playFrom(tracks.slice(0, MAX_QUEUE).map((t) => toItem(t, context)), index);
      if (get().shuffle) queue = q.shuffle(queue);
      void startAt(queue);
    },
    playAlbum(album, index) {
      const tracks = album.tracks.map((t) => trackSnapshot(t, album));
      const cover = albumSnapshot(album).cover;
      get().playList(tracks, index, { type: "album", id: album.id, name: album.title, image: cover });
    },
    playTrack(track, context = SEARCH_CONTEXT) {
      if (get().queue.items.length >= MAX_QUEUE) return;
      const queue = q.add(get().queue, [toItem(track, context)]);
      void startAt(q.jump(queue, queue.items.length - 1));
    },
    playNext(tracks, context = QUEUE_CONTEXT) {
      setQueue(q.insertNext(get().queue, room(tracks).map((t) => toItem(t, context))));
    },
    addToQueue(tracks, context = QUEUE_CONTEXT) {
      setQueue(q.add(get().queue, room(tracks).map((t) => toItem(t, context))));
    },
    jumpTo(index) {
      void startAt(q.jump(get().queue, index));
    },
    remove(index) {
      const before = get().queue;
      const queue = q.remove(before, index);
      if (index === before.current && get().now.phase !== "idle") void startAt(queue);
      else setQueue(queue);
    },
    move(index, delta) {
      setQueue(q.move(get().queue, index, index + delta));
    },
    moveItems(keys, beforeKey) {
      const queue = get().queue;
      const index = new Map(queue.items.map((item, i) => [item.key, i]));
      const order = moveKeys(queue.items.map((i) => i.key), keys, beforeKey);
      setQueue(q.reorder(queue, order.map((key) => index.get(key)!)));
    },
    removeItems(keys) {
      const before = get().queue;
      const gone = new Set(keys);
      const playingRemoved = gone.has(q.currentItem(before)?.key ?? "") && get().now.phase !== "idle";
      let queue = before;
      for (let i = before.items.length - 1; i >= 0; i--) if (gone.has(before.items[i].key)) queue = q.remove(queue, i);
      if (playingRemoved) void startAt(queue);
      else setQueue(queue);
    },
    clear() {
      set({ queue: q.emptyQueue(), shuffle: false });
      halt();
    },

    seekBy(seconds) {
      if (player.loaded) actions.seek(get().player.position + seconds);
    },
    setVolume(volume) {
      volume = Math.min(Math.max(volume, 0), 1);
      player.setVolume(volume);
      player.setMuted(false);
      set({ volume, muted: false });
      saveDeviceVolume(volume, false);
    },
    toggleMute() {
      const muted = !get().muted;
      player.setMuted(muted);
      set({ muted });
      saveDeviceVolume(get().volume, muted);
    },
    setShuffle(shuffle) {
      const queue = get().queue;
      set({ queue: shuffle ? q.shuffle(queue) : q.unshuffle(queue), shuffle });
    },
    setRepeat: (repeat) => set({ repeat }),
    cycleRepeat() {
      const order: Repeat[] = ["off", "all", "one"];
      set({ repeat: order[(order.indexOf(get().repeat) + 1) % order.length] });
    },

    async load() {
      const { playback } = await me.playback();
      halt();
      const device = deviceVolume();
      if (device && !playback) {
        player.setVolume(device.volume);
        player.setMuted(device.muted);
        set(device);
      }
      if (playback) {
        const context = playback.context ?? QUEUE_CONTEXT;
        const items = playback.queue.map((track) => toItem(track, context));
        const queue: q.Queue<QueueItem> = {
          items,
          current: items.length === 0 ? -1 : Math.min(playback.index, items.length - 1),
        };
        const order = playback.originalOrder;
        if (playback.shuffle && order?.length === items.length) queue.order = order;
        const item = q.currentItem(queue);
        resumeAt = item ? playback.positionMs / 1000 : 0;
        const { volume, muted } = deviceVolume() ?? playback;
        player.setVolume(volume);
        player.setMuted(muted);
        set({
          queue,
          shuffle: queue.order !== undefined,
          repeat: playback.repeat,
          volume,
          muted,
          player: { status: "idle", position: resumeAt, duration: (item?.track.durationMs ?? 0) / 1000 },
        });
        if (item) showMedia(item);
      }
      sync.start(true);
    },
    reset() {
      sync.stop();
      halt();
      set({ queue: q.emptyQueue(), shuffle: false, repeat: "off" });
    },
  };
});

/** Saves playback state to the server and keeps the server's prefetch in step with the queue. */
const sync = (() => {
  let active = false;
  let queueDirty = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let prefetchTimer: ReturnType<typeof setTimeout> | undefined;
  let prefetched = "";
  let positionTimer: ReturnType<typeof setInterval> | undefined;

  function snapshot(withQueue: boolean): PlaybackUpdate {
    const s = usePlayback.getState();
    const item = q.currentItem(s.queue);
    const state: PlaybackUpdate = {
      index: Math.max(s.queue.current, 0),
      positionMs: Math.round(Math.max(s.player.position, 0) * 1000),
      shuffle: s.shuffle,
      repeat: s.repeat,
      volume: s.volume,
      muted: s.muted,
      context: item?.context,
    };
    if (withQueue) {
      const full: Pick<SyncedPlayback, "queue" | "originalOrder"> = { queue: s.queue.items.map((i) => i.track) };
      if (s.queue.order) full.originalOrder = s.queue.order;
      Object.assign(state, full);
    }
    return state;
  }

  function save(keepalive = false) {
    clearTimeout(saveTimer);
    if (!active) return;
    const withQueue = queueDirty;
    queueDirty = false;
    me.savePlayback(snapshot(withQueue), keepalive).catch(() => {
      if (withQueue) queueDirty = true;
    });
  }

  function prefetch() {
    const { queue, repeat } = usePlayback.getState();
    const tracks = q.upcoming(queue, repeat).map((i) => trackSummary(i.track));
    // A restored queue has not started yet: include its current track.
    const current = q.currentItem(queue);
    if (current && usePlayback.getState().now.phase === "idle") tracks.unshift(trackSummary(current.track));
    const signature = tracks.map((t) => t.id).join("\n");
    if (signature === prefetched) return;
    prefetched = signature;
    void content.prefetch({ tracks: tracks.slice(0, MAX_QUEUE) }).catch(() => {});
  }

  usePlayback.subscribe((s, prev) => {
    if (!active) return;
    const queueChanged = s.queue.items !== prev.queue.items || s.queue.order !== prev.queue.order;
    if (queueChanged) queueDirty = true;
    if (
      queueChanged ||
      s.queue.current !== prev.queue.current ||
      s.shuffle !== prev.shuffle ||
      s.repeat !== prev.repeat ||
      s.volume !== prev.volume ||
      s.muted !== prev.muted
    ) {
      saveSoon(SAVE_DELAY_MS);
    }
    if (queueChanged || s.queue.current !== prev.queue.current || s.repeat !== prev.repeat) {
      clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(prefetch, PREFETCH_DELAY_MS);
    }
  });

  function saveSoon(delay: number) {
    if (!active) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(), delay);
  }

  if (typeof window !== "undefined") window.addEventListener("pagehide", () => save(true));

  return {
    saveSoon,
    /** Prefetches the queue again even if it has not changed (to re-check expired tracks). */
    prefetchAgain() {
      if (!active) return;
      prefetched = "";
      prefetch();
    },
    start(fetchAhead: boolean) {
      active = true;
      queueDirty = false;
      prefetched = "";
      clearInterval(positionTimer);
      positionTimer = setInterval(() => {
        if (usePlayback.getState().player.status === "playing") save();
      }, POSITION_SAVE_MS);
      if (fetchAhead) prefetch();
    },
    stop() {
      active = false;
      clearTimeout(saveTimer);
      clearTimeout(prefetchTimer);
      clearInterval(positionTimer);
    },
  };
})();

/** Asks the server to look ahead in the queue again, for tracks whose answers expired. */
export function prefetchAgain(): void {
  sync.prefetchAgain();
}
