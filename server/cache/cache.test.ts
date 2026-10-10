import { expect, test } from "vitest";
import { splitAddonUrl } from "../addons/urls";
import { Cache, cacheKey, effectiveTtl, MemoryCacheStore } from "./cache";

test("entries expire after their TTL; add-on Cache-Control can only shorten it", async () => {
  let now = new Date("2026-01-01T00:00:00Z");
  const cache = new Cache(new MemoryCacheStore(), () => now);
  await cache.set("k", { a: 1 }, "ok", 60);
  await cache.set("skip", { a: 1 }, "ok", 0);
  expect((await cache.get("k"))?.value).toEqual({ a: 1 });
  expect(await cache.get("skip")).toBeUndefined();
  now = new Date("2026-01-01T00:01:00Z");
  expect(await cache.get("k")).toBeUndefined();
  expect(await cache.purge()).toBe(1);

  expect(effectiveTtl(3600, "public, max-age=60")).toBe(60);
  expect(effectiveTtl(3600, "max-age=999999")).toBe(3600);
  expect(effectiveTtl(3600, "no-store")).toBe(0);
  expect(effectiveTtl(3600, null)).toBe(3600);
});

test("add-ons without a config segment share keys across users; config-bearing ones do not", () => {
  const config = Buffer.from(JSON.stringify({ key: "not-a-real-key" })).toString("base64url");
  const plain = splitAddonUrl("https://addon.example/music");
  const withConfig = splitAddonUrl(`https://addon.example/music/${config}`);
  expect(plain).toEqual({ baseUrl: "https://addon.example/music", hasConfig: false });
  expect(withConfig).toEqual({ baseUrl: "https://addon.example/music", hasConfig: true });
  expect(splitAddonUrl("https://user:pw@addon.example").hasConfig).toBe(true);

  const params = { q: "song", type: undefined };
  const shared = (urlHash: string) => cacheKey("search", { ...plain, urlHash }, params);
  expect(shared("hash-of-user-a")).toBe(shared("hash-of-user-b"));
  const priv = (urlHash: string) => cacheKey("search", { ...withConfig, urlHash }, params);
  expect(priv("hash-of-user-a")).not.toBe(priv("hash-of-user-b"));
  expect(priv("hash-of-user-a")).not.toContain(config);
});
