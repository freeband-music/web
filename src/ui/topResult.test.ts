import { describe, expect, it } from "vitest";
import { pickTopResult, songsFollowing } from "./topResult";

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

describe("pickTopResult with popularity", () => {
  const results = {
    artists: [{ id: "a1", name: "The Dark Side of the Moon", popularity: 47 }],
    albums: [
      { id: "al1", title: "The Dark Side of the Moon", artists: [], popularity: 75 },
      { id: "al2", title: "Dark Side of the Moon", artists: [], popularity: 45 },
    ],
    tracks: [{ id: "t1", title: "Dark Side of the Moon", artists: [], popularity: 50 }],
  };

  it("takes the most popular name match, ignoring a leading article and punctuation", () => {
    expect(pickTopResult("dark side of the moon", results)).toMatchObject({ kind: "album", album: { id: "al1" } });
    expect(pickTopResult("DARK SIDE... of the moon!", results)).toMatchObject({ kind: "album", album: { id: "al1" } });
  });

  it("prefers an album, then an artist, on equal popularity, and falls back to the first results", () => {
    const tie = { artists: [{ id: "a", name: "X", popularity: 60 }], albums: [{ id: "b", title: "X", artists: [], popularity: 60 }], tracks: [] };
    expect(pickTopResult("x", tie)).toMatchObject({ kind: "album" });
    expect(pickTopResult("something else", results)).toMatchObject({ kind: "album", album: { id: "al1" } });
  });

  it("puts the top album's tracks or the top artist's songs first", () => {
    const by = (id: string, artist: string, popularity?: number) => ({ id, title: id, artists: [{ id: artist, name: artist }], popularity });
    const tracks = [by("t1", "other", 90), by("t2", "a1", 10), by("t3", "a1", 40)];
    const top = { kind: "artist" as const, artist: { id: "a1", name: "A" } };
    expect(songsFollowing(top, tracks).map((t) => t.id)).toEqual(["t3", "t2", "t1"]);
    const album = { kind: "album" as const, album: { id: "al", title: "Al", artists: [] } };
    expect(songsFollowing(album, tracks, [by("s1", "a1"), tracks[0]]).map((t) => t.id)).toEqual(["s1", "t1", "t2", "t3"]);
  });
});
