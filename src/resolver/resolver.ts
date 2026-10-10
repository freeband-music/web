import type { StreamResult } from "../../shared/api";
import type { Quality, Stream } from "../types";

export type QualityPreset = "addon" | "data-saver" | "balanced" | "best";

export type PlayableStream = Stream;

export type ResolveResult =
  | { kind: "ok"; streams: PlayableStream[] }
  | { kind: "queued"; message?: string }
  | { kind: "not_found"; message?: string }
  | { kind: "no_addon" }
  | { kind: "error"; message: string };

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

/** What the player should do with the server's answer to a stream request. */
export function toResolveResult(result: StreamResult, preset: QualityPreset): ResolveResult {
  switch (result.kind) {
    case "ok":
      return result.streams.length > 0
        ? { kind: "ok", streams: sortStreams(result.streams, preset) }
        : { kind: "not_found" };
    case "not_cached":
      return { kind: "not_found" };
    default:
      return result;
  }
}
