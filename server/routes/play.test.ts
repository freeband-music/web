import { expect, test } from "vitest";
import { sessionCookie, testApp } from "../testing";

const ADDON = "http://addon.test/secret-config";

test("play links redirect to the media URL or relay the audio, only for their owner", async () => {
  const asked: { url: string; range?: string }[] = [];
  const app = await testApp(
    {},
    {
      fetch: async (url, init) => {
        const range = (init?.headers as Record<string, string> | undefined)?.Range;
        asked.push({ url, range });
        if (url === `${ADDON}/play/a`) return new Response(null, { status: 302, headers: { location: "/play/a2" } });
        if (url === `${ADDON.replace("/secret-config", "")}/play/a2`) {
          return new Response(null, { status: 302, headers: { location: "https://media.test/a.flac" } });
        }
        if (url === `${ADDON}/play/b`) {
          return new Response("abc", { status: 206, headers: { "content-type": "audio/flac", "content-range": "bytes 0-2/9" } });
        }
        return new Response(null, { status: 404 });
      },
    },
  );
  const signup = async (username: string) => {
    const res = await app.inject({ method: "POST", url: "/api/auth/signup", payload: { username, password: "password-1" } });
    return { id: res.json().user.id as string, cookie: sessionCookie(res) };
  };
  const alice = await signup("alice");
  const bob = await signup("bob");
  const now = new Date().toISOString();
  await app.ctx.db
    .insertInto("user_addons")
    .values({
      id: "addon-1", user_id: alice.id, position: 0, enabled: 1, has_config: 1, url_encrypted: "x", url_hash: "x", base_url: "x",
      manifest_json: "{}", manifest_fetched_at: now, created_at: now,
    })
    .execute();
  const links = app.ctx.playLinks;
  const linkA = await links.issue(alice.id, "addon-1", `${ADDON}/play/a`);
  expect(await links.issue(alice.id, "addon-1", `${ADDON}/play/a`)).toBe(linkA);
  const get = (url: string, cookie: string, range?: string) =>
    app.inject({ method: "GET", url, headers: range ? { cookie, range } : { cookie } });

  // Redirects within the add-on are followed by the server; the media URL is remembered.
  const first = await get(linkA, alice.cookie);
  expect(first.statusCode).toBe(302);
  expect(first.headers.location).toBe("https://media.test/a.flac");
  const before = asked.length;
  expect((await get(linkA, alice.cookie)).headers.location).toBe("https://media.test/a.flac");
  expect(asked.length).toBe(before);
  expect((await get(linkA, bob.cookie)).statusCode).toBe(404);

  // An add-on that serves the audio itself is relayed, with the range passed on.
  const linkB = await links.issue(alice.id, "addon-1", `${ADDON}/play/b`);
  const relayed = await get(linkB, alice.cookie, "bytes=0-2");
  expect(relayed.statusCode).toBe(206);
  expect(relayed.body).toBe("abc");
  expect(relayed.headers["content-range"]).toBe("bytes 0-2/9");
  expect(asked.at(-1)).toEqual({ url: `${ADDON}/play/b`, range: "bytes=0-2" });
  await app.close();
});
