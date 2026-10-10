import type { TrackSummary } from "../../shared/api";
import type { PrefetchConfig } from "../config";
import type { ActiveAddon, AddonService } from "./service";

export interface PrefetchCandidate {
  /** The stream cache already answers a queue-allowed request for this track. */
  streamCached: boolean;
  /** The track lacks details the stream request needs (no track number). */
  needsDetails: boolean;
}

export interface PrefetchStep {
  index: number;
  /** Ask the stream add-ons (which may queue a download); otherwise only warm the track's details. */
  allowQueue: boolean;
}

/**
 * Which upcoming tracks to look up, in order. Only the first `limit` are
 * considered; the first `queueAhead` of those may reach the stream add-ons.
 * Tracks already cached are skipped, as are later tracks whose details are
 * already complete (nothing to warm for them).
 */
export function planPrefetch(
  candidates: PrefetchCandidate[],
  opts: Pick<PrefetchConfig, "limit" | "queueAhead">,
): PrefetchStep[] {
  return candidates.slice(0, opts.limit).flatMap((c, index) => {
    const allowQueue = index < opts.queueAhead;
    if (c.streamCached || (!allowQueue && !c.needsDetails)) return [];
    return [{ index, allowQueue }];
  });
}

/** Runs `work` over `items` with at most `concurrency` at once; stops taking new items once aborted. */
async function pool<T>(items: T[], concurrency: number, signal: AbortSignal, work: (item: T) => Promise<unknown>) {
  let next = 0;
  const worker = async () => {
    while (!signal.aborted && next < items.length) {
      const item = items[next++];
      await work(item).catch(() => undefined);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

/**
 * One background prefetch job per user and kind; starting a new one cancels
 * the previous. Results land in the cache, so later requests are instant.
 */
export class PrefetchManager {
  private readonly jobs = new Map<string, AbortController>();

  constructor(
    private readonly service: AddonService,
    private readonly config: PrefetchConfig,
  ) {}

  private begin(jobKey: string): AbortController {
    this.jobs.get(jobKey)?.abort();
    const controller = new AbortController();
    this.jobs.set(jobKey, controller);
    return controller;
  }

  private finish(jobKey: string, controller: AbortController, run: Promise<void>): void {
    void run.finally(() => {
      if (this.jobs.get(jobKey) === controller) this.jobs.delete(jobKey);
    });
  }

  /** Plans and starts the stream prefetch; resolves with the number of lookups started. */
  async streams(userId: string, addons: ActiveAddon[], tracks: TrackSummary[]): Promise<number> {
    const jobKey = `stream:${userId}`;
    const controller = this.begin(jobKey);
    const window = tracks.slice(0, this.config.limit);
    const candidates = await Promise.all(
      window.map(async (t) => ({
        streamCached: await this.service.streamCached(addons, t.id),
        needsDetails: !t.trackNumber,
      })),
    );
    if (controller.signal.aborted) return 0;
    const steps = planPrefetch(candidates, this.config);
    const run = pool(steps, this.config.concurrency, controller.signal, (step) => {
      const track = window[step.index];
      return step.allowQueue
        ? this.service.streams(addons, track, true)
        : this.service.trackDetails(addons, track);
    });
    this.finish(jobKey, controller, run);
    return steps.length;
  }

  /** Warms album and track metadata; same cap as the stream prefetch. */
  meta(userId: string, addons: ActiveAddon[], albumIds: string[], trackIds: string[]): number {
    const jobKey = `meta:${userId}`;
    const controller = this.begin(jobKey);
    const items = [
      ...albumIds.map((id) => ({ kind: "album" as const, id })),
      ...trackIds.map((id) => ({ kind: "track" as const, id })),
    ].slice(0, this.config.limit);
    const run = pool(items, this.config.concurrency, controller.signal, (item) =>
      this.service.meta(addons, item.kind, item.id),
    );
    this.finish(jobKey, controller, run);
    return items.length;
  }

  /** Cancels every job (on shutdown). */
  stopAll(): void {
    for (const controller of this.jobs.values()) controller.abort();
    this.jobs.clear();
  }
}
