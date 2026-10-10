import type {
  Album,
  Artist,
  Manifest,
  Resource,
  SearchResponse,
  StreamResponse,
  Track,
  TrackSummary,
} from "../types";

/** Major protocol version this app speaks. */
export const PROTOCOL_MAJOR = 0;

const META_TIMEOUT_MS = 15_000;
const STREAM_TIMEOUT_MS = 30_000;

export interface InstalledAddon {
  /** Base URL without a trailing slash; may end in a config segment. */
  baseUrl: string;
  manifest: Manifest;
}

export interface AddonFailure {
  addon: InstalledAddon;
  message: string;
}

export interface SearchResult {
  results: SearchResponse;
  errors: AddonFailure[];
  /** Number of add-ons that were asked. */
  asked: number;
}

export interface StreamFanout {
  responses: { addon: InstalledAddon; response: StreamResponse }[];
  errors: AddonFailure[];
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export class AddonError extends Error {}

/** Accepts a base URL or a full manifest URL and returns the base URL. */
export function normalizeBaseUrl(input: string): string {
  let text = input.trim();
  if (!text) throw new AddonError("Enter an add-on URL.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new AddonError("That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AddonError("Add-on URLs must start with http:// or https://.");
  }
  const path = url.pathname.replace(/\/manifest\.json$/, "").replace(/\/+$/, "");
  return url.origin + path;
}

export function validateManifest(data: unknown): Manifest {
  const m = data as Record<string, unknown> | null;
  const isStrings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (!m || typeof m !== "object") throw new AddonError("The add-on manifest is not an object.");
  for (const field of ["id", "name", "version", "protocolVersion"]) {
    if (typeof m[field] !== "string" || !m[field]) {
      throw new AddonError(`The add-on manifest is missing "${field}".`);
    }
  }
  for (const field of ["resources", "idPrefixes"]) {
    if (!isStrings(m[field])) throw new AddonError(`The add-on manifest is missing "${field}".`);
  }
  const manifest = m as unknown as Manifest;
  const major = Number.parseInt(manifest.protocolVersion.split(".")[0], 10);
  if (Number.isNaN(major)) {
    throw new AddonError(`The add-on has an invalid protocol version "${manifest.protocolVersion}".`);
  }
  if (major !== PROTOCOL_MAJOR) {
    throw new AddonError(
      `This add-on uses protocol version ${manifest.protocolVersion}, but this app only supports version ${PROTOCOL_MAJOR}.x.`,
    );
  }
  return manifest;
}

async function getJson(fetchFn: FetchFn, url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchFn(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    } catch {
      throw new AddonError(
        controller.signal.aborted
          ? `The add-on did not answer within ${timeoutMs / 1000} seconds.`
          : "Could not reach the add-on.",
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (controller.signal.aborted) {
        throw new AddonError(`The add-on did not answer within ${timeoutMs / 1000} seconds.`);
      }
      body = undefined;
    }
    if (!response.ok) {
      const message = (body as { error?: { message?: unknown } } | undefined)?.error?.message;
      throw new AddonError(
        typeof message === "string" && message ? message : `The add-on answered with HTTP ${response.status}.`,
      );
    }
    if (body === undefined || body === null || typeof body !== "object") {
      throw new AddonError("The add-on sent an invalid response.");
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const defaultFetch: FetchFn = (input, init) => fetch(input, init);

export async function installAddon(input: string, fetchFn: FetchFn = defaultFetch): Promise<InstalledAddon> {
  const baseUrl = normalizeBaseUrl(input);
  const data = await getJson(fetchFn, `${baseUrl}/manifest.json`, META_TIMEOUT_MS);
  return { baseUrl, manifest: validateManifest(data) };
}

function serves(addon: InstalledAddon, resource: Resource, id?: string): boolean {
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

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
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

export interface AddonClient {
  hasResource(resource: Resource): boolean;
  search(query: string): Promise<SearchResult>;
  getArtist(id: string): Promise<Artist>;
  getAlbum(id: string): Promise<Album>;
  getTrack(id: string, timeoutMs?: number): Promise<Track>;
  /** Asks the stream add-ons, passing the track's details along. */
  getStreams(track: TrackSummary): Promise<StreamFanout>;
}

export function createAddonClient(
  getAddons: () => InstalledAddon[],
  fetchFn: FetchFn = defaultFetch,
): AddonClient {
  /** Asks every given add-on at once; a failure never blocks the others. */
  async function fanOut<T>(addons: InstalledAddon[], path: string, timeoutMs: number) {
    const settled = await Promise.allSettled(
      addons.map((addon) => getJson(fetchFn, addon.baseUrl + path, timeoutMs) as Promise<T>),
    );
    const ok: { addon: InstalledAddon; data: T }[] = [];
    const errors: AddonFailure[] = [];
    settled.forEach((result, i) => {
      if (result.status === "fulfilled") ok.push({ addon: addons[i], data: result.value });
      else errors.push({ addon: addons[i], message: errorMessage(result.reason) });
    });
    return { ok, errors };
  }

  async function meta<T>(kind: "artist" | "album" | "track", id: string, timeoutMs = META_TIMEOUT_MS): Promise<T> {
    const addons = getAddons().filter((a) => serves(a, "meta", id));
    if (addons.length === 0) throw new AddonError("No installed add-on can provide this item.");
    const { ok, errors } = await fanOut<T>(addons, `/meta/${kind}/${encodeURIComponent(id)}`, timeoutMs);
    if (ok.length === 0) throw new AddonError(errors[0].message);
    return ok[0].data;
  }

  return {
    hasResource: (resource) => getAddons().some((a) => serves(a, resource)),

    async search(query) {
      const addons = getAddons().filter((a) => serves(a, "search"));
      const { ok, errors } = await fanOut<SearchResponse>(
        addons,
        `/search?q=${encodeURIComponent(query)}`,
        META_TIMEOUT_MS,
      );
      return {
        results: {
          tracks: mergeById(ok.map((r) => r.data.tracks)),
          albums: mergeById(ok.map((r) => r.data.albums)),
          artists: mergeById(ok.map((r) => r.data.artists)),
        },
        errors,
        asked: addons.length,
      };
    },

    getArtist: (id) => meta<Artist>("artist", id),
    getAlbum: (id) => meta<Album>("album", id),
    getTrack: (id, timeoutMs) => meta<Track>("track", id, timeoutMs),

    async getStreams(track) {
      const addons = getAddons().filter((a) => serves(a, "stream", track.id));
      const { ok, errors } = await fanOut<StreamResponse>(
        addons,
        `/stream/track/${encodeURIComponent(track.id)}?${streamQuery(track)}`,
        STREAM_TIMEOUT_MS,
      );
      return {
        responses: ok.map((r) => ({
          addon: r.addon,
          response: { ...r.data, streams: Array.isArray(r.data.streams) ? r.data.streams : [] },
        })),
        errors,
      };
    },
  };
}
