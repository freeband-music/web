import { create } from "zustand";
import type { QueueTrackState, QueueTrackStatus } from "../../shared/api";
import { content } from "../api/client";

/** Tracks whose status is asked for: the current one and those after it. */
export const STATUS_LIMIT = 200;

interface QueueStatusState {
  /** By track ID. */
  statuses: Record<string, QueueTrackStatus>;
  /** Asks the server for these tracks' status; failures keep the last known one. */
  load(trackIds: string[]): Promise<void>;
}

export const useQueueStatus = create<QueueStatusState>()((set, get) => ({
  statuses: {},
  async load(trackIds) {
    const ids = [...new Set(trackIds)].slice(0, STATUS_LIMIT);
    if (ids.length === 0) return;
    try {
      const { statuses } = await content.queueStatus(ids);
      const next = { ...get().statuses };
      ids.forEach((id, i) => {
        if (statuses[i]) next[id] = statuses[i];
      });
      set({ statuses: next });
    } catch {
      // Offline or signed out: keep what is shown.
    }
  },
}));

/** Will be skipped when played now: nothing playable, as far as the add-ons know. */
export const isUnavailable = (state: QueueTrackState | undefined) => state === "unavailable";

/** Counts for the summary line, in display order. */
export function summarize(states: (QueueTrackState | undefined)[]): { ready: number; unavailable: number; checking: number; error: number } {
  const count = (wanted: QueueTrackState[]) => states.filter((s) => s !== undefined && wanted.includes(s)).length;
  return {
    ready: count(["ready"]),
    unavailable: count(["unavailable"]),
    checking: count(["checking", "unchecked", "expired"]) + states.filter((s) => s === undefined).length,
    error: count(["error"]),
  };
}
