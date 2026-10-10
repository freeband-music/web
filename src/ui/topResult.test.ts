import { describe, expect, it } from "vitest";
import { pickTopResult } from "./topResult";

const artist = (id: string, name: string) => ({ id, name });
const track = { id: "fake:t1", title: "Song", artists: [artist("fake:a2", "Other")] };
const album = { id: "fake:al1", title: "Record", artists: [] };

describe("pickTopResult", () => {
  it("prefers an artist named like the query, then the first track, then the first album", () => {
    const artists = [artist("fake:a2", "Other"), artist("fake:a1", "Beyoncé")];
    expect(pickTopResult(" beyonce ", { tracks: [track], albums: [album], artists })).toEqual({
      kind: "artist",
      artist: artists[1],
    });
    expect(pickTopResult("song", { tracks: [track], albums: [album], artists })).toEqual({ kind: "track", track });
    expect(pickTopResult("record", { tracks: [], albums: [album], artists })).toEqual({ kind: "album", album });
    expect(pickTopResult("x", { tracks: [], albums: [], artists: [] })).toBeNull();
  });
});
