import { useState } from "react";
import type { PlayContext, StatsRange } from "../../shared/api";
import { history } from "../api/client";
import { Card, CardGrid, Chips } from "./cards";
import { count, Cover, useAsync } from "./common";
import { playArtistById, playTracks } from "./play";
import { links } from "./router";
import { TrackList } from "./tracks";

const RANGES: { value: StatsRange; label: string; title: string }[] = [
  { value: "4w", label: "4 weeks", title: "the last 4 weeks" },
  { value: "6m", label: "6 months", title: "the last 6 months" },
  { value: "all", label: "All time", title: "all time" },
];

const TOP_CONTEXT: PlayContext = { type: "queue", name: "Your top tracks" };

export function StatsScreen() {
  const [range, setRange] = useState<StatsRange>("4w");
  const stats = useAsync(() => history.stats(range), `stats-${range}`);
  const title = RANGES.find((r) => r.value === range)!.title;
  return (
    <div className="screen">
      <h1>Your stats</h1>
      <Chips options={RANGES} value={range} onChange={(value) => value && setRange(value)} />
      {stats.loading && <p className="muted">Loading…</p>}
      {"error" in stats && <p className="status error">{stats.error}</p>}
      {"data" in stats && (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-value">{stats.data.totalPlays.toLocaleString()}</span>
              <span className="muted">plays</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{Math.round(stats.data.totalMinutes).toLocaleString()}</span>
              <span className="muted">minutes listened</span>
            </div>
          </div>
          {stats.data.totalPlays === 0 && <p className="muted">Nothing played in {title} yet.</p>}
          {stats.data.topTracks.length > 0 && (
            <section>
              <h2>Top tracks of {title}</h2>
              <TrackList
                rows={stats.data.topTracks.map((t, i) => ({
                  key: `${i}-${t.track.id}`,
                  track: t.track,
                }))}
                onPlay={(index) => playTracks(stats.data.topTracks.map((t) => t.track), TOP_CONTEXT, { index })}
                context={TOP_CONTEXT}
                showCover
                showAlbum
              />
            </section>
          )}
          {stats.data.topArtists.length > 0 && (
            <section>
              <h2>Top artists of {title}</h2>
              <CardGrid>
                {stats.data.topArtists.map(({ artist, plays }) => (
                  <Card
                    key={artist.id}
                    round
                    href={links.artist(artist.id)}
                    cover={<Cover src={artist.image} round />}
                    title={artist.name}
                    subtitle={count(plays, "play")}
                    onPlay={() => playArtistById(artist.id)}
                  />
                ))}
              </CardGrid>
            </section>
          )}
        </>
      )}
    </div>
  );
}
