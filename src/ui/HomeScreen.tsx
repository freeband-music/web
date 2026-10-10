import type { RecentContext } from "../../shared/api";
import { history } from "../api/client";
import { useAddons } from "../store/addons";
import { useAuth } from "../store/auth";
import { useLibrary } from "../store/library";
import { Card, CardRow, QuickTile } from "./cards";
import { artistNames, count, Cover, LikedCover, Mosaic, useAsync } from "./common";
import { playArtistById, playContext, playLiked, playPlaylistById, playTracks } from "./play";
import { links } from "./router";

const QUICK_TILES = 8;
const TOP_CONTEXT = { type: "queue", name: "Your top tracks" } as const;

function greeting(hour: number): string {
  if (hour < 5 || hour >= 18) return "Good evening";
  if (hour < 12) return "Good morning";
  return "Good afternoon";
}

const contextHref = (c: { type: RecentContext["type"]; id: string }) => links[c.type](c.id);

function contextCover(c: RecentContext) {
  if (c.type === "playlist") return <Mosaic covers={c.covers ?? (c.image ? [c.image] : [])} />;
  return <Cover src={c.image} round={c.type === "artist"} />;
}

const KIND_LABEL = { album: "Album", playlist: "Playlist", artist: "Artist" } as const;

/** What to do first, when there is nothing to show yet. */
function Welcome() {
  const addons = useAddons((s) => s.addons);
  const loaded = useAddons((s) => s.loaded);
  const enabled = addons.filter((a) => a.enabled);
  const hasMeta = enabled.some((a) => a.manifest.resources.includes("search"));
  const hasStream = enabled.some((a) => a.manifest.resources.includes("stream"));
  if (!loaded) return null;
  if (!hasMeta || !hasStream) {
    return (
      <div className="empty-card">
        <h2>{enabled.length === 0 ? "Install your first add-ons" : "One more add-on"}</h2>
        <p className="muted">
          Freeband plays what your add-ons provide.{" "}
          {!hasMeta && "A metadata add-on lets you search and browse music. "}
          {!hasStream && "A stream add-on finds something to play for each track."}
        </p>
        <a className="button primary" href={links.addons}>
          Open Add-ons
        </a>
      </div>
    );
  }
  return (
    <div className="empty-card">
      <h2>Start listening</h2>
      <p className="muted">Search for an artist, album or song. What you play shows up here.</p>
      <a className="button primary" href={links.search}>
        Search
      </a>
    </div>
  );
}

export function HomeScreen() {
  const user = useAuth((s) => s.user);
  const { playlists, likedCount } = useLibrary();
  const recent = useAsync(() => history.recent(), "recent");
  const stats = useAsync(() => history.stats("4w"), "stats-4w");
  const contexts = !recent.loading && "data" in recent ? recent.data.contexts : [];
  const top = !stats.loading && "data" in stats ? stats.data : undefined;

  const quick: { key: string; href: string; cover: React.ReactNode; title: string; play(): Promise<void> }[] = [
    { key: "liked", href: links.liked, cover: <LikedCover />, title: "Liked songs", play: () => playLiked() },
  ];
  for (const c of contexts) {
    quick.push({ key: `${c.type}:${c.id}`, href: contextHref(c), cover: contextCover(c), title: c.name, play: () => playContext(c.type, c.id) });
  }
  for (const p of playlists) {
    if (!quick.some((q) => q.key === `playlist:${p.id}`)) {
      quick.push({ key: `playlist:${p.id}`, href: links.playlist(p.id), cover: <Mosaic covers={p.covers} />, title: p.name, play: () => playPlaylistById(p.id) });
    }
  }
  const nothingYet = contexts.length === 0 && playlists.length === 0 && likedCount === 0 && !(top && top.totalPlays > 0);
  const loading = recent.loading || stats.loading;

  return (
    <div className="screen home">
      <h1>
        {greeting(new Date().getHours())}
        {user ? `, ${user.displayName}` : ""}
      </h1>
      {!loading && nothingYet && <Welcome />}
      {!nothingYet && (
        <div className="quick-grid">
          {quick.slice(0, QUICK_TILES).map((q) => (
            <QuickTile key={q.key} href={q.href} cover={q.cover} title={q.title} onPlay={q.play} />
          ))}
        </div>
      )}
      {contexts.length > 0 && (
        <CardRow title="Recently played">
          {contexts.map((c) => (
            <Card
              key={`${c.type}:${c.id}`}
              href={contextHref(c)}
              cover={contextCover(c)}
              title={c.name}
              subtitle={KIND_LABEL[c.type]}
              round={c.type === "artist"}
              onPlay={() => playContext(c.type, c.id)}
            />
          ))}
        </CardRow>
      )}
      {top && top.topTracks.length > 0 && (
        <CardRow title="Your top tracks this month" href={links.stats}>
          {top.topTracks.slice(0, 10).map(({ track }, index) => (
            <Card
              key={track.id}
              href={track.album ? links.album(track.album.id) : links.stats}
              cover={<Cover src={track.album?.cover} />}
              title={track.title}
              subtitle={artistNames(track.artists)}
              onPlay={() =>
                playTracks(
                  top.topTracks.map((t) => t.track),
                  TOP_CONTEXT,
                  { index },
                )
              }
            />
          ))}
        </CardRow>
      )}
      {top && top.topArtists.length > 0 && (
        <CardRow title="Your top artists this month" href={links.stats}>
          {top.topArtists.slice(0, 10).map(({ artist }) => (
            <Card
              key={artist.id}
              round
              href={links.artist(artist.id)}
              cover={<Cover src={artist.image} round />}
              title={artist.name}
              subtitle="Artist"
              onPlay={() => playArtistById(artist.id)}
            />
          ))}
        </CardRow>
      )}
      {playlists.length > 0 && (
        <CardRow title="Your playlists" href={links.library}>
          {playlists.slice(0, 10).map((p) => (
            <Card
              key={p.id}
              href={links.playlist(p.id)}
              cover={<Mosaic covers={p.covers} />}
              title={p.name}
              subtitle={count(p.trackCount, "song")}
              onPlay={() => playPlaylistById(p.id)}
            />
          ))}
        </CardRow>
      )}
    </div>
  );
}
