import { useState } from "react";
import { library } from "../api/client";
import { useAuth } from "../store/auth";
import { useLibrary } from "../store/library";
import { count, LikedCover, useAsync } from "./common";
import { ActionBar, PageHeader } from "./page";
import { LIKED_CONTEXT, playTracks } from "./play";
import { matchesFilter } from "./libraryModel";
import { TrackList } from "./tracks";

export function LikedScreen() {
  const user = useAuth((s) => s.user);
  const liked = useLibrary((s) => s.liked);
  const [filter, setFilter] = useState("");
  const likes = useAsync(async () => {
    const response = await library.likes();
    // The hearts of this page are known to be on.
    const known = Object.fromEntries(response.tracks.map((t) => [t.track.id, true]));
    useLibrary.setState({ liked: { ...useLibrary.getState().liked, ...known } });
    return response.tracks;
  }, "likes");

  if (likes.loading) return <p className="screen muted">Loading…</p>;
  if ("error" in likes) return <p className="screen status error">{likes.error}</p>;
  // Unliked here: gone from the list at once.
  const all = likes.data.filter((t) => liked[t.track.id] !== false);
  const shown = all.filter((t) => matchesFilter(filter, t.track.title, ...t.track.artists.map((a) => a.name), t.track.album?.title));
  const tracks = shown.map((t) => t.track);
  const rows = shown.map((t) => ({ key: t.track.id, track: t.track }));

  return (
    <div className="screen">
      <PageHeader cover={<LikedCover />} kind="Playlist" title="Liked songs" meta={`${user?.displayName ?? ""} · ${count(all.length, "song")}`} />
      <ActionBar onPlay={() => playTracks(tracks, LIKED_CONTEXT)} onShuffle={() => playTracks(tracks, LIKED_CONTEXT, { shuffle: true })}>
        <input
          type="search"
          className="filter-box"
          placeholder="Search in Liked songs"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Filter"
        />
      </ActionBar>
      {all.length === 0 && <p className="muted">Songs you like appear here. Tap the heart on any track.</p>}
      {all.length > 0 && shown.length === 0 && <p className="muted">No liked songs match “{filter}”.</p>}
      <TrackList rows={rows} onPlay={(index) => playTracks(tracks, LIKED_CONTEXT, { index })} context={LIKED_CONTEXT} showCover showAlbum showHeader />
    </div>
  );
}
