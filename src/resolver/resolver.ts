import type { StreamFanout } from "../addons/client";
import type { Quality, Stream, Track, TrackSummary } from "../types";

export type QualityPreset = "addon" | "data-saver" | "balanced" | "best";

export type PlayableStream = Stream;

export type ResolveResult =
  | { kind: "ok"; streams: PlayableStream[] }
  | { kind: "queued"; message?: string }
  | { kind: "not_found" }
  | { kind: "no_addon" }
  | { kind: "error"; message: string };

/** The part of the add-on client the resolver needs. */
export interface StreamSource {
  hasResource(resource: "stream"): boolean;
  getTrack(id: string, timeoutMs?: number): Promise<Track>;
  getStreams(track: TrackSummary): Promise<StreamFanout>;
}

const DETAILS_TIMEOUT_MS = 5000;

/**
 * A track without a track number (typically one from search results) is
 * looked up first so the stream request carries full details. If the lookup
 * fails, the track is used as it is.
 */
async function withDetails(source: StreamSource, track: TrackSummary): Promise<TrackSummary> {
  if (track.trackNumber) return track;
  try {
    const full = await source.getTrack(track.id, DETAILS_TIMEOUT_MS);
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

type Tier = "hi-res" | "cd" | "high" | "low";

const TIER_ORDER: Record<Exclude<QualityPreset, "addon">, Tier[]> = {
  "data-saver": ["high", "low", "cd", "hi-res"],
  balanced: ["cd", "high", "hi-res", "low"],
  best: ["hi-res", "cd", "high", "low"],
};

const KIND_BAND = { exact: 0, edition: 1, loose: 2 } as const;

export function qualityTier(quality: Quality): Tier {
  if (quality.lossless) {
    return (quality.bitDepth ?? 0) > 16 || (quality.sampleRateHz ?? 0) > 48000 ? "hi-res" : "cd";
  }
  return quality.bitrateKbps === undefined || quality.bitrateKbps >= 256 ? "high" : "low";
}

/** Confidence rounded down to 0.1 steps, as an integer 0..10. */
function confidenceStep(confidence: number): number {
  return Math.floor(confidence * 10 + 1e-9);
}

/** Re-orders streams for a preset; "addon" keeps the add-on's order. */
export function sortStreams<T extends Stream>(streams: T[], preset: QualityPreset): T[] {
  if (preset === "addon") return streams;
  const order = TIER_ORDER[preset];
  const key = (s: T) => [
    KIND_BAND[s.match.kind] ?? 3,
    -confidenceStep(s.match.confidence),
    order.indexOf(qualityTier(s.quality)),
    -s.match.confidence,
  ];
  return streams
    .map((stream, index) => ({ stream, index, key: key(stream) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) {
        if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
      }
      return a.index - b.index;
    })
    .map((entry) => entry.stream);
}

export async function resolveTrack(
  source: StreamSource,
  track: TrackSummary,
  preset: QualityPreset,
): Promise<ResolveResult> {
  if (!source.hasResource("stream")) return { kind: "no_addon" };
  let fanout: StreamFanout;
  try {
    fanout = await source.getStreams(await withDetails(source, track));
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  const { responses, errors } = fanout;

  const playable = responses
    .filter((r) => r.response.status === "ok")
    .flatMap((r) => r.response.streams);
  if (playable.length > 0) return { kind: "ok", streams: sortStreams(playable, preset) };

  const queued = responses.find((r) => r.response.status === "queued");
  if (queued) return { kind: "queued", message: queued.response.message };
  if (responses.length === 0 && errors.length > 0) return { kind: "error", message: errors[0].message };
  return { kind: "not_found" };
}
