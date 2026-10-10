import type { AddonFailureCode, Manifest } from "../../shared/api";

/** Major protocol version this server speaks. */
export const PROTOCOL_MAJOR = 0;

export const META_TIMEOUT_MS = 15_000;
export const STREAM_TIMEOUT_MS = 30_000;

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export const defaultFetch: FetchFn = (input, init) => fetch(input, init);

/** A failed add-on request. Messages never contain the add-on URL. */
export class AddonError extends Error {
  constructor(
    message: string,
    /** The add-on's HTTP status, when it answered. */
    readonly httpStatus?: number,
    readonly code: AddonFailureCode = "error",
  ) {
    super(message);
  }
}

/** The manifest declares a protocol major version this server does not speak. */
export class UnsupportedProtocolError extends AddonError {
  constructor(readonly protocolVersion: string) {
    super(
      `This add-on uses protocol version ${protocolVersion}, but this server only supports version ${PROTOCOL_MAJOR}.x.`,
      undefined,
      "unsupported_protocol",
    );
  }
}

export interface JsonResponse {
  body: object;
  cacheControl: string | null;
}

/** GETs JSON from an add-on with a timeout; the URL is never put in an error. */
export async function getJson(fetchFn: FetchFn, url: string, timeoutMs: number): Promise<JsonResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const timeout = () =>
    new AddonError(`The add-on did not answer within ${timeoutMs / 1000} seconds.`, undefined, "unreachable");
  try {
    let response: Response;
    try {
      response = await fetchFn(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    } catch (err) {
      if (err instanceof AddonError) throw err;
      throw controller.signal.aborted ? timeout() : new AddonError("Could not reach the add-on.", undefined, "unreachable");
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (controller.signal.aborted) throw timeout();
      body = undefined;
    }
    if (!response.ok) {
      const message = (body as { error?: { message?: unknown } } | undefined)?.error?.message;
      throw new AddonError(
        typeof message === "string" && message ? message : `The add-on answered with HTTP ${response.status}.`,
        response.status,
      );
    }
    if (body === undefined || body === null || typeof body !== "object") {
      throw new AddonError("The add-on sent an invalid response.");
    }
    return { body, cacheControl: response.headers.get("cache-control") };
  } finally {
    clearTimeout(timer);
  }
}

export function validateManifest(data: unknown): Manifest {
  const m = data as Record<string, unknown> | null;
  const isStrings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (!m || typeof m !== "object") throw new AddonError("The add-on manifest is not an object.");
  for (const field of ["id", "name", "version", "protocolVersion"]) {
    if (typeof m[field] !== "string" || !m[field]) throw new AddonError(`The add-on manifest is missing "${field}".`);
  }
  for (const field of ["resources", "idPrefixes"]) {
    if (!isStrings(m[field])) throw new AddonError(`The add-on manifest is missing "${field}".`);
  }
  const manifest = m as unknown as Manifest;
  const major = Number.parseInt(manifest.protocolVersion.split(".")[0], 10);
  if (Number.isNaN(major)) {
    throw new AddonError(`The add-on has an invalid protocol version "${manifest.protocolVersion}".`);
  }
  if (major !== PROTOCOL_MAJOR) throw new UnsupportedProtocolError(manifest.protocolVersion);
  return manifest;
}
