import type {
  AddonFailure,
  AddonSearchResponse,
  Manifest,
  SearchResponse,
  SearchType,
  StreamResolveResponse,
  StreamResponse,
  StreamResult,
  TrackSummary,
} from "../../shared/api";
import { cacheKey, effectiveTtl, type AddonScope, type Cache } from "../cache/cache";
import type { CacheTtls } from "../config";
import { HttpError, notFound } from "../http";
import { AddonError, getJson, META_TIMEOUT_MS, STREAM_TIMEOUT_MS, validateManifest, type FetchFn } from "./http";

type Resource = Manifest["resources"][number];
type MetaKind = "artist" | "album" | "track";

/** An enabled add-on of one user, with its decrypted URL. Never log `url`. */
export interface ActiveAddon {
  id: string;
  url: string;
  manifest: Manifest;
  scope: AddonScope;
}

/** Failed requests are remembered briefly so a broken add-on is not asked again at once. */
const ERROR_TTL_S = 30;
const DETAILS_TIMEOUT_MS = 5000;

/** What a stream cache entry holds. */
interface StreamEntry {
  response: StreamResponse;
  /** The add-on was free to queue a download when it answered. */
  queueAllowed: boolean;
}

/** True when the add-on understands `queue=false` on stream requests (protocol 0.3.0 and later). */
export function supportsNoQueue(manifest: Manifest): boolean {
  const [major, minor] = manifest.protocolVersion.split(".").map((part) => Number.parseInt(part, 10));
  return major > 0 || (major === 0 && minor >= 3);
}

export function serves(addon: ActiveAddon, resource: Resource, id?: string): boolean {
  if (!addon.manifest.resources.includes(resource)) return false;
  // An empty prefix list means the add-on accepts any ID.
  const prefixes = addon.manifest.idPrefixes;
  return id === undefined || prefixes.length === 0 || prefixes.some((prefix) => id.startsWith(prefix));
}

/** The track details a stream add-on needs, as query parameters; unknown ones are left out. */
export function streamQuery(track: TrackSummary): string {
  const params = new URLSearchParams({ title: track.title });
  for (const artist of track.artists) params.append("artist", artist.name);
  const album = track.album;
  const albumArtist = album?.artists[0]?.name;
  const optional: Record<string, string | number | undefined> = {
    albumTitle: album?.title,
    albumArtist: albumArtist !== track.artists[0]?.name ? albumArtist : undefined,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber,
    trackCount: album?.trackCount,
    durationMs: track.durationMs,
    year: album?.year,
    isrc: track.isrc,
  };
  for (const [name, value] of Object.entries(optional)) {
    if (value !== undefined && value !== "") params.set(name, String(value));
  }
  return params.toString();
}

/** Encodes an ID as a path segment; `:` stays as it is, being valid in a segment and common in IDs. */
export function idSegment(id: string): string {
  return encodeURIComponent(id).replace(/%3A/gi, ":");
}

function mergeById<T extends { id: string }>(lists: unknown[]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list as T[]) {
      if (!item || typeof item.id !== "string" || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function failure(addon: ActiveAddon, reason: unknown): AddonFailure {
  return { addonId: addon.id, name: addon.manifest.name, message: message(reason) };
}

/** Combines per-add-on stream answers (in add-on order) into one result. */
export function combineStreams(
  answers: ({ response: StreamResponse } | { notCached: true } | { error: string })[],
): StreamResult {
  const responses = answers.flatMap((a) => ("response" in a ? [a.response] : []));
  const streams = responses.filter((r) => r.status === "ok").flatMap((r) => r.streams);
  if (streams.length > 0) return { kind: "ok", streams };
  const queued = responses.find((r) => r.status === "queued");
  if (queued) return { kind: "queued", message: queued.message };
  if (answers.some((a) => "notCached" in a)) return { kind: "not_cached" };
  const error = answers.find((a): a is { error: string } => "error" in a);
  if (responses.length === 0 && error) return { kind: "error", message: error.error };
  return { kind: "not_found" };
}

/** Add-on requests on behalf of users, through the cache. */
export class AddonService {
  constructor(
    private readonly cache: Cache,
    private readonly ttl: CacheTtls,
    private readonly fetchFn: FetchFn,
  ) {}

  /** Fetches and validates a manifest, bypassing the cache (install and refresh). */
  async fetchManifest(url: string): Promise<Manifest> {
    const { body } = await getJson(this.fetchFn, `${url}/manifest.json`, META_TIMEOUT_MS);
    return validateManifest(body);
  }

  /** A cached GET; not-found and error answers are cached too and re-thrown on a hit. */
  private async cachedGet<T>(
    addon: ActiveAddon,
    resource: string,
    params: Record<string, string | undefined>,
    path: string,
    ttl: number,
    timeoutMs = META_TIMEOUT_MS,
  ): Promise<T> {
    const key = cacheKey(resource, addon.scope, params);
    const hit = await this.cache.get<T | { message: string }>(key);
    if (hit) {
      if (hit.status === "ok") return hit.value as T;
      throw new AddonError((hit.value as { message: string }).message, hit.status === "not_found" ? 404 : undefined);
    }
    return this.cache.dedupe(key, async () => {
      try {
        const res = await getJson(this.fetchFn, addon.url + path, timeoutMs);
        await this.cache.set(key, res.body, "ok", effectiveTtl(ttl, res.cacheControl));
        return res.body as T;
      } catch (err) {
        const notFoundAnswer = err instanceof AddonError && err.httpStatus === 404;
        await this.cache.set(
          key,
          { message: message(err) },
          notFoundAnswer ? "not_found" : "error",
          notFoundAnswer ? this.ttl.notFound : ERROR_TTL_S,
        );
        throw err;
      }
    });
  }

  async search(addons: ActiveAddon[], q: string, type?: SearchType): Promise<AddonSearchResponse> {
    const asked = addons.filter((a) => serves(a, "search"));
    const query = new URLSearchParams({ q });
    if (type) query.set("type", type);
    const settled = await Promise.allSettled(
      asked.map((a) => this.cachedGet<SearchResponse>(a, "search", { q, type }, `/search?${query}`, this.ttl.search)),
    );
    const ok: SearchResponse[] = [];
    const errors: AddonFailure[] = [];
    settled.forEach((r, i) => (r.status === "fulfilled" ? ok.push(r.value) : errors.push(failure(asked[i], r.reason))));
    return {
      results: {
        tracks: mergeById(ok.map((r) => r.tracks)),
        albums: mergeById(ok.map((r) => r.albums)),
        artists: mergeById(ok.map((r) => r.artists)),
      },
      errors,
      asked: asked.length,
    };
  }

  /** The first answer, in add-on order, from the add-ons serving this ID. */
  async meta<T>(addons: ActiveAddon[], kind: MetaKind, id: string, timeoutMs = META_TIMEOUT_MS): Promise<T> {
    const asked = addons.filter((a) => serves(a, "meta", id));
    if (asked.length === 0) throw notFound("No installed add-on can provide this item.", "no_addon");
    const path = `/meta/${kind}/${idSegment(id)}`;
    const settled = await Promise.allSettled(
      asked.map((a) => this.cachedGet<T>(a, `meta:${kind}`, { id }, path, this.ttl.meta, timeoutMs)),
    );
    const ok = settled.find((r) => r.status === "fulfilled");
    if (ok) return (ok as PromiseFulfilledResult<T>).value;
    const reasons = settled.map((r) => (r as PromiseRejectedResult).reason);
    if (reasons.every((r) => r instanceof AddonError && r.httpStatus === 404)) throw notFound(message(reasons[0]));
    throw new HttpError(502, "addon_failed", message(reasons[0]));
  }

  /**
   * A track without a track number (typically from search results) is looked
   * up first so the stream request carries full details; on failure the track
   * is used as it is.
   */
  async trackDetails(addons: ActiveAddon[], track: TrackSummary): Promise<TrackSummary> {
    if (track.trackNumber) return track;
    try {
      const full = await this.meta<TrackSummary>(addons, "track", track.id, DETAILS_TIMEOUT_MS);
      return {
        ...track,
        trackNumber: full.trackNumber ?? track.trackNumber,
        discNumber: full.discNumber ?? track.discNumber,
        durationMs: full.durationMs ?? track.durationMs,
        isrc: full.isrc ?? track.isrc,
        album: full.album ? { ...track.album, ...full.album } : track.album,
      };
    } catch {
      return track;
    }
  }

  private streamKey(addon: ActiveAddon, trackId: string): string {
    return cacheKey("stream", addon.scope, { id: trackId });
  }

  /**
   * A cached stream entry answers a request unless it is a "nothing found"
   * from an attempt that could not queue and this request may queue.
   */
  private usable(entry: StreamEntry, allowQueue: boolean): boolean {
    return entry.response.status === "ok" || entry.queueAllowed || !allowQueue;
  }

  /** True when the cache already answers a queue-allowed stream request for this track. */
  async streamCached(addons: ActiveAddon[], trackId: string): Promise<boolean> {
    const asked = addons.filter((a) => serves(a, "stream", trackId));
    const entries = await Promise.all(asked.map((a) => this.cache.get<StreamEntry>(this.streamKey(a, trackId))));
    if (entries.some((e) => e?.value.response.status === "ok")) return true;
    return entries.every((e) => e !== undefined && this.usable(e.value, true));
  }

  /** True when some add-on serving this track can be asked for its streams without queueing a download. */
  canCheckWithoutQueue(addons: ActiveAddon[], trackId: string): boolean {
    return addons.some((a) => serves(a, "stream", trackId) && supportsNoQueue(a.manifest));
  }

  /**
   * Asks the stream add-ons for a track. With `allowQueue` false, add-ons
   * that support it are sent `queue=false` (answer only what is playable now);
   * older add-ons are not contacted, as they may queue a download on any request.
   */
  async streams(addons: ActiveAddon[], track: TrackSummary, allowQueue: boolean): Promise<StreamResolveResponse> {
    const asked = addons.filter((a) => serves(a, "stream", track.id));
    if (asked.length === 0) return { result: { kind: "no_addon" }, cached: false };
    let details: Promise<TrackSummary> | undefined;
    let cached = true;
    const answers = await Promise.all(
      asked.map(async (addon) => {
        const key = this.streamKey(addon, track.id);
        const hit = await this.cache.get<StreamEntry>(key);
        if (hit && this.usable(hit.value, allowQueue)) return { response: hit.value.response };
        if (!allowQueue && !supportsNoQueue(addon.manifest)) return { notCached: true as const };
        cached = false;
        details ??= this.trackDetails(addons, track);
        // Queue-allowed and queue-free requests are deduplicated separately: their answers differ.
        const flightKey = allowQueue ? key : `${key}:noqueue`;
        try {
          const response = await this.cache.dedupe(flightKey, () => this.fetchStreams(addon, key, details!, allowQueue));
          return { response };
        } catch (err) {
          return { error: message(err) };
        }
      }),
    );
    return { result: combineStreams(answers), cached };
  }

  private async fetchStreams(
    addon: ActiveAddon,
    key: string,
    details: Promise<TrackSummary>,
    queueAllowed: boolean,
  ): Promise<StreamResponse> {
    const track = await details;
    const queue = queueAllowed ? "" : "&queue=false";
    const path = `/stream/track/${idSegment(track.id)}?${streamQuery(track)}${queue}`;
    const res = await getJson(this.fetchFn, addon.url + path, STREAM_TIMEOUT_MS);
    const data = res.body as Partial<StreamResponse>;
    const streams = Array.isArray(data.streams) ? data.streams : [];
    const status = data.status === "ok" && streams.length === 0 ? "not_found" : (data.status ?? "not_found");
    const response: StreamResponse = { ...data, status, streams } as StreamResponse;
    // A queued download should become playable soon, so it is not cached. A
    // not_found given without queueing does not block a later queue-allowed request (see `usable`).
    if (status === "ok") {
      await this.cache.set(key, { response, queueAllowed }, "ok", effectiveTtl(this.ttl.stream, res.cacheControl));
    } else if (status === "not_found") {
      await this.cache.set(key, { response, queueAllowed }, "not_found", this.ttl.notFound);
    }
    return response;
  }
}
