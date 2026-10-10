import { expect, test } from "vitest";
import type { InstalledAddon, StreamFanout } from "../addons/client";
import type { Stream, TrackSummary } from "../types";
import { resolveTrack, type StreamSource } from "./resolver";

const addon: InstalledAddon = {
  baseUrl: "http://fake",
  manifest: {
    id: "fake",
    name: "Fake",
    version: "1.0.0",
    protocolVersion: "0.1.0",
    resources: ["stream"],
    idPrefixes: [],
  },
};

function fakeSource(streams: Stream[], installed = true): StreamSource {
  const fanout: StreamFanout = {
    responses: [{ addon, response: { status: "ok", streams } }],
    errors: [],
  };
  return {
    hasResource: () => installed,
    getTrack: async () => {
      throw new Error("not expected");
    },
    getStreams: async () => fanout,
  };
}

const track: TrackSummary = {
  id: "fake:track:1",
  title: "Song",
  artists: [{ id: "fake:artist:1", name: "Band" }],
  trackNumber: "1",
};

const exact = { confidence: 0.95, kind: "exact" } as const;
const cd: Stream = {
  title: "cd",
  quality: { codec: "flac", lossless: true, bitDepth: 16, sampleRateHz: 44100 },
  match: exact,
  url: "http://fake/cd.flac",
};
const hiRes: Stream = {
  title: "hi-res",
  quality: { codec: "flac", lossless: true, bitDepth: 24, sampleRateHz: 96000 },
  match: exact,
  url: "http://fake/hires.flac",
};

test("merges ok streams from several add-ons in order and skips responses that are not ok", async () => {
  const source: StreamSource = {
    ...fakeSource([]),
    getStreams: async () => ({
      responses: [
        { addon, response: { status: "queued", streams: [], message: "preparing" } },
        { addon, response: { status: "ok", streams: [cd] } },
        { addon, response: { status: "ok", streams: [hiRes] } },
      ],
      errors: [],
    }),
  };
  const result = await resolveTrack(source, track, "addon");
  expect(result).toEqual({ kind: "ok", streams: [cd, hiRes] });

  const none = await resolveTrack(fakeSource([]), track, "addon");
  expect(none).toEqual({ kind: "not_found" });
});

test("Best puts hi-res above cd of equal match; Add-on default keeps add-on order", async () => {
  const source = fakeSource([cd, hiRes]);
  const best = await resolveTrack(source, track, "best");
  expect(best.kind === "ok" && best.streams.map((s) => s.title)).toEqual(["hi-res", "cd"]);

  const kept = await resolveTrack(source, track, "addon");
  expect(kept.kind === "ok" && kept.streams.map((s) => s.title)).toEqual(["cd", "hi-res"]);
});

test("no stream add-on installed resolves to no_addon", async () => {
  const result = await resolveTrack(fakeSource([cd], false), track, "addon");
  expect(result).toEqual({ kind: "no_addon" });
});

test("a track without a track number is looked up before streams are requested", async () => {
  const { trackNumber: _omitted, ...bare } = track;
  const asked: TrackSummary[] = [];
  const source: StreamSource = {
    hasResource: () => true,
    getTrack: async () => ({ ...bare, trackNumber: "7", durationMs: 1000 }),
    getStreams: async (requested) => {
      asked.push(requested);
      return { responses: [{ addon, response: { status: "ok", streams: [cd] } }], errors: [] };
    },
  };
  await resolveTrack(source, bare, "addon");
  expect(asked).toHaveLength(1);
  expect(asked[0].trackNumber).toBe("7");
});
