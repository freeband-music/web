import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { sessionCookie, testApp } from "../testing";

const FAKE_ADDON = resolve(process.env.FREEBAND_PROTOCOL ?? "../protocol", "conformance/fake_addon.py");
const hasPython = spawnSync("python3", ["--version"]).status === 0 && existsSync(FAKE_ADDON);

async function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => done(typeof address === "object" && address ? address.port : 0));
    });
  });
}

let addon: ChildProcess | undefined;
let addonUrl = "";

beforeAll(async () => {
  if (!hasPython) return;
  const port = await freePort();
  addon = spawn("python3", [FAKE_ADDON, "--port", String(port)], { stdio: "ignore" });
  addonUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    if (await fetch(`${addonUrl}/manifest.json`).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("fake add-on did not start");
});

afterAll(() => {
  addon?.kill();
});

test.skipIf(!hasPython)("install the fake add-on, search, stream and prefetch through the API", async () => {
  const app = await testApp();
  const signup = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: { username: "alice", password: "password-1" },
  });
  const cookie = sessionCookie(signup);
  const call = (method: "GET" | "POST", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie } });

  const install = await call("POST", "/api/addons", { url: `${addonUrl}/manifest.json` });
  expect(install.statusCode).toBe(200);
  expect(install.json().addon).toMatchObject({ baseUrl: addonUrl, hasConfig: false, enabled: true, position: 0 });
  expect((await call("POST", "/api/addons", { url: addonUrl })).statusCode).toBe(409);

  const search = (await call("GET", "/api/search?q=fake")).json();
  expect(search.asked).toBe(1);
  expect(search.results.tracks.map((t: { id: string }) => t.id)).toEqual(["fake:track:1", "fake:track:2"]);
  const [track1, track2] = search.results.tracks;

  expect((await call("GET", "/api/meta/album/fake:album:1")).json().tracks).toHaveLength(2);
  expect((await call("GET", "/api/meta/album/fake:album:9")).statusCode).toBe(404);

  // Nothing cached yet: a request that may not queue does not reach the add-on.
  expect((await call("POST", "/api/stream", { track: track1, allowQueue: false })).json().result).toEqual({
    kind: "not_cached",
  });
  const first = (await call("POST", "/api/stream", { track: track1 })).json();
  expect(first.result.kind).toBe("ok");
  expect(first.result.streams[0].match.kind).toBe("exact");
  expect(first.cached).toBe(false);
  expect((await call("POST", "/api/stream", { track: track1 })).json().cached).toBe(true);

  // Prefetch the rest of the queue; the result lands in the stream cache.
  const pre = await call("POST", "/api/prefetch", { tracks: [track1, track2], current: 0 });
  expect(pre.statusCode).toBe(202);
  expect(pre.json().planned).toBe(1);
  let result;
  for (let i = 0; i < 50; i++) {
    result = (await call("POST", "/api/stream", { track: track2, allowQueue: false })).json().result;
    if (result.kind === "ok") break;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(result.kind).toBe("ok");

  const list = (await call("GET", "/api/addons")).json();
  expect(JSON.stringify(list)).not.toContain("url_encrypted");
  await app.close();
});
