import { users } from "../api/client";
import { useAuth } from "../store/auth";
import { Card, CardGrid } from "./cards";
import { count, Mosaic, useAsync } from "./common";
import { PageHeader } from "./page";
import { playPlaylistById } from "./play";
import { links } from "./router";

export function ProfileScreen({ username }: { username: string }) {
  const me = useAuth((s) => s.user);
  const profile = useAsync(() => users.profile(username), `profile-${username}`);
  if (profile.loading) return <p className="screen muted">Loading…</p>;
  if ("error" in profile) return <p className="screen status error">{profile.error}</p>;
  const { user, playlists } = profile.data;
  const own = me?.username.toLowerCase() === user.username.toLowerCase();
  return (
    <div className="screen">
      <PageHeader
        round
        cover={
          <div className="cover round profile-initial" aria-hidden="true">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
        }
        kind="Profile"
        title={user.displayName}
        meta={
          <>
            <span>
              {user.username} · {count(playlists.length, "public playlist")}
            </span>
            {own && (
              <span>
                {" "}
                · <a href={links.account}>Edit profile</a>
              </span>
            )}
          </>
        }
      />
      <h2>Public playlists</h2>
      {playlists.length === 0 && (
        <p className="muted">
          {own ? "Make a playlist public to show it here." : `${user.displayName} has no public playlists.`}
        </p>
      )}
      <CardGrid>
        {playlists.map((p) => (
          <Card
            key={p.id}
            href={links.playlist(p.id)}
            cover={<Mosaic covers={p.covers} />}
            title={p.name}
            subtitle={count(p.trackCount, "song")}
            onPlay={() => playPlaylistById(p.id)}
          />
        ))}
      </CardGrid>
    </div>
  );
}
