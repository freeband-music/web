import { expect, test } from "vitest";
import type { Stream } from "../types";
import { toResolveResult } from "./resolver";

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

test("Best puts hi-res above cd of equal match; Add-on default keeps add-on order", () => {
  const best = toResolveResult({ kind: "ok", streams: [cd, hiRes] }, "best");
  expect(best.kind === "ok" && best.streams.map((s) => s.title)).toEqual(["hi-res", "cd"]);
  const kept = toResolveResult({ kind: "ok", streams: [cd, hiRes] }, "addon");
  expect(kept.kind === "ok" && kept.streams.map((s) => s.title)).toEqual(["cd", "hi-res"]);
});

test("an empty or uncached answer counts as not found", () => {
  expect(toResolveResult({ kind: "ok", streams: [] }, "addon")).toEqual({ kind: "not_found" });
  expect(toResolveResult({ kind: "not_cached" }, "addon")).toEqual({ kind: "not_found" });
});
