import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Player, type PlayerState } from "../player/player";
import * as q from "../queue/queue";
import { resolveTrack, type PlayableStream, type ResolveResult } from "../resolver/resolver";
import type { Album, TrackSummary } from "../types";
import { addonClient } from "./addons";
import { useSettings } from "./settings";

const SKIP_DELAY_MS = 3000;

export interface QueueItem {
  /** Unique per queue entry, so a track can be queued twice. */
  key: string;
  track: TrackSummary;
  /** Album page the track was played from, if any. */
  albumId?: string;
}

/** What is happening with the current queue item. */
export type NowState =
  | { phase: "idle" }
  | { phase: "resolving" }
  | { phase: "playing"; stream: PlayableStream }
  | { phase: "queued" }
  | { phase: "not_found" }
  | { phase: "no_addon" }
  | { phase: "error"; message: string };

interface PlaybackState {
  queue: q.Queue<QueueItem>;
  volume: number;
  now: NowState;
  player: PlayerState;

  playAlbum(album: Album, index: number): void;
  playTrack(track: TrackSummary): void;
  addTrack(track: TrackSummary): void;
  jumpTo(index: number): void;
  remove(index: number): void;
  move(index: number, delta: -1 | 1): void;
  clear(): void;
  toggle(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
}

let keyCounter = 0;
function toItem(track: TrackSummary, albumId?: string): QueueItem {
  keyCounter += 1;
  return { key: `${Date.now().toString(36)}-${keyCounter}`, track, albumId: albumId ?? track.album?.id };
}

function resolveItem(item: QueueItem): Promise<ResolveResult> {
  return resolveTrack(addonClient, item.track, useSettings.getState().quality);
}

export const usePlayback = create<PlaybackState>()(
  persist(
    (set, get) => {
      /** Bumped whenever the current item changes, to drop stale async results. */
      let generation = 0;
      let skipTimer: ReturnType<typeof setTimeout> | undefined;
      let streams: PlayableStream[] = [];
      let streamIndex = 0;
      /** Streams resolved ahead of time for the item after the current one. */
      let ahead: { key: string; result: Promise<ResolveResult> } | null = null;

      const player = new Player({
        onState: (state) => set({ player: state }),
        onEnded: () => advance(),
        onError: () => {
          streamIndex += 1;
          if (streamIndex < streams.length) playStream();
          else fail({ phase: "error", message: "None of the available sources could be played." });
        },
      });

      function playStream() {
        const stream = streams[streamIndex];
        set({ now: { phase: "playing", stream } });
        player.play(stream.url);
      }

      /** Shows why the current item cannot play, then skips it after a moment. */
      function fail(now: NowState) {
        set({ now });
        if (now.phase === "no_addon") return;
        const mine = generation;
        skipTimer = setTimeout(() => {
          if (mine === generation) advance();
        }, SKIP_DELAY_MS);
      }

      function advance() {
        const following = q.next(get().queue);
        if (following) startAt(following);
      }

      function halt() {
        generation += 1;
        clearTimeout(skipTimer);
        streams = [];
        ahead = null;
        player.stop();
        player.setMediaInfo(null);
        set({ now: { phase: "idle" } });
      }

      function resolveAhead(queue: q.Queue<QueueItem>) {
        const following = q.next(queue);
        const item = following && q.currentItem(following);
        if (!item) ahead = null;
        else if (ahead?.key !== item.key) ahead = { key: item.key, result: resolveItem(item) };
      }

      /** Makes the queue's current item the playing one. */
      async function startAt(queue: q.Queue<QueueItem>) {
        const item = q.currentItem(queue);
        if (!item) {
          set({ queue });
          halt();
          return;
        }
        const mine = ++generation;
        clearTimeout(skipTimer);
        streams = [];
        player.stop();
        set({ queue, now: { phase: "resolving" } });
        player.setMediaInfo({
          title: item.track.title,
          artist: item.track.artists.map((a) => a.name).join(", "),
          album: item.track.album?.title,
          artwork: item.track.album?.cover,
        });

        // Whatever was resolved ahead of time for this item is trusted as is.
        const early = ahead?.key === item.key ? ahead.result : undefined;
        ahead = null;
        const result = await (early ?? resolveItem(item));
        if (mine !== generation) return;

        if (result.kind === "ok") {
          streams = result.streams;
          streamIndex = 0;
          playStream();
          resolveAhead(get().queue);
        } else if (result.kind === "queued" || result.kind === "not_found" || result.kind === "no_addon") {
          fail({ phase: result.kind });
        } else {
          fail({ phase: "error", message: result.message });
        }
      }

      const active = () => get().now.phase !== "idle";

      const actions = {
        toggle() {
          const { player: state, queue } = get();
          if (state.status === "playing" || state.status === "loading") player.pause();
          else if (player.loaded) player.resume();
          else if (queue.current >= 0) void startAt(queue);
          else if (queue.items.length > 0) void startAt(q.jump(queue, 0));
        },
        next: advance,
        previous() {
          const back = get().player.position > 3 ? null : q.previous(get().queue);
          if (back) void startAt(back);
          else player.seek(0);
        },
        seek: (seconds: number) => player.seek(seconds),
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
        volume: 1,
        now: { phase: "idle" },
        player: { status: "idle", position: 0, duration: 0 },
        ...actions,

        playAlbum(album, index) {
          const { tracks, ...summary } = album;
          const items = tracks.map((track) => {
            const from = track.album ?? summary;
            return toItem({ ...track, album: { ...from, trackCount: from.trackCount ?? tracks.length } }, album.id);
          });
          void startAt(q.playFrom(items, index));
        },
        playTrack(track) {
          const queue = q.add(get().queue, [toItem(track)]);
          void startAt(q.jump(queue, queue.items.length - 1));
        },
        addTrack(track) {
          const queue = q.add(get().queue, [toItem(track)]);
          set({ queue });
          if (active()) resolveAhead(queue);
        },
        jumpTo(index) {
          void startAt(q.jump(get().queue, index));
        },
        remove(index) {
          const before = get().queue;
          const queue = q.remove(before, index);
          if (index !== before.current) {
            set({ queue });
            if (active()) resolveAhead(queue);
          } else if (active()) {
            void startAt(queue);
          } else {
            set({ queue });
          }
        },
        move(index, delta) {
          const queue = q.move(get().queue, index, index + delta);
          set({ queue });
          if (active()) resolveAhead(queue);
        },
        clear() {
          set({ queue: q.emptyQueue() });
          halt();
        },
        setVolume(volume) {
          player.setVolume(volume);
          set({ volume });
        },
      };
    },
    {
      name: "freeband.playback",
      version: 1,
      partialize: (state) => ({ queue: state.queue, volume: state.volume }),
      onRehydrateStorage: () => (state) => {
        if (state) state.setVolume(state.volume);
      },
    },
  ),
);
