import { expect, test } from "vitest";
import type { PlaylistResponse, TrackSnapshot } from "../../shared/api";
import { sessionCookie, testApp } from "../testing";

const track = (n: number, album = "fake:album:1"): TrackSnapshot => ({
  id: `fake:track:${n}`,
  title: `Song ${n}`,
  artists: [{ id: "fake:artist:1", name: "Artist" }],
  album: { id: album, title: "Album", artists: [], cover: `https://img.example/${album}.jpg` },
  trackNumber: String(n),
  durationMs: 1000 * n,
});

test("create, add, move, remove and share a playlist", async () => {
  const app = await testApp();
  const signup = async (username: string) => {
    const res = await app.inject({ method: "POST", url: "/api/auth/signup", payload: { username, password: "password-1" } });
    const cookie = sessionCookie(res);
    return (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: object) =>
      app.inject({ method, url: `/api${url}`, payload, headers: { cookie, "x-requested-with": "freeband" } });
  };
  const alice = await signup("alice");
  const bob = await signup("bob");
  const titles = (r: PlaylistResponse) => r.tracks.map((e) => e.track.title);

  const created = await alice("POST", "/playlists", { name: "Mix", tracks: [track(1), track(2)] });
  expect(created.statusCode).toBe(201);
  const id = created.json<PlaylistResponse>().playlist.id;

  let res = (await alice("POST", `/playlists/${id}/tracks`, { tracks: [track(3, "fake:album:2"), track(1)], position: 1 })).json<PlaylistResponse>();
  expect(titles(res)).toEqual(["Song 1", "Song 3", "Song 1", "Song 2"]);
  expect(res.playlist).toMatchObject({ trackCount: 4, durationMs: 7000, isOwner: true });
  expect(res.playlist.covers).toHaveLength(2);
  const ask = await alice("POST", `/playlists/${id}/tracks`, { tracks: [track(2), track(4)], duplicates: "ask" });
  expect(ask.statusCode).toBe(409);
  expect(ask.json().error).toEqual({ code: "duplicate_tracks", message: "1 of these 2 songs is already in the playlist." });
  const skipped = (await alice("POST", `/playlists/${id}/tracks`, { tracks: [track(2), track(4)], duplicates: "skip" })).json();
  expect(titles(skipped)).toEqual(["Song 1", "Song 3", "Song 1", "Song 2", "Song 4"]);
  res = (await alice("DELETE", `/playlists/${id}/tracks`, { entryIds: [skipped.tracks[4].entryId] })).json();

  const [first, , , last] = res.tracks.map((e) => e.entryId);
  res = (await alice("POST", `/playlists/${id}/tracks/move`, { entryIds: [last, first], beforeEntryId: null })).json();
  expect(titles(res)).toEqual(["Song 3", "Song 1", "Song 1", "Song 2"]);
  res = (await alice("DELETE", `/playlists/${id}/tracks`, { entryIds: [res.tracks[0].entryId] })).json();
  expect(titles(res)).toEqual(["Song 1", "Song 1", "Song 2"]);

  // Private: invisible to others. Public: readable and followable, not writable.
  expect((await bob("GET", `/playlists/${id}`)).statusCode).toBe(404);
  await alice("PATCH", `/playlists/${id}`, { visibility: "public" });
  expect((await bob("GET", `/playlists/${id}`)).statusCode).toBe(200);
  expect((await bob("POST", `/playlists/${id}/tracks`, { tracks: [track(9)] })).statusCode).toBe(403);
  expect((await bob("PUT", `/playlists/${id}/follow`)).json<PlaylistResponse>().playlist.followed).toBe(true);
  expect((await bob("GET", "/playlists")).json().playlists).toHaveLength(1);
  await alice("PATCH", `/playlists/${id}`, { visibility: "private" });
  expect((await bob("GET", "/playlists")).json().playlists).toHaveLength(0);
  expect((await alice("DELETE", `/playlists/${id}`)).statusCode).toBe(204);
  await app.close();
});
