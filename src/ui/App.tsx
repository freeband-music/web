import { useAuth } from "../store/auth";
import { useLibrary } from "../store/library";
import { currentItem } from "../queue/queue";
import { usePlayback } from "../store/playback";
import { AccountScreen } from "./AccountScreen";
import { AddonsScreen } from "./AddonsScreen";
import { AlbumScreen } from "./AlbumScreen";
import { ArtistScreen } from "./ArtistScreen";
import { AuthScreen } from "./AuthScreen";
import { ArtistLinks, count, Cover, IconButton, LikeButton, LikedCover, Mosaic } from "./common";
import { HomeScreen } from "./HomeScreen";
import { Icon, type IconName } from "./icons";
import { LibraryScreen } from "./LibraryScreen";
import { LikedScreen } from "./LikedScreen";
import { openMenu, Overlays, type MenuItem } from "./overlays";
import { PlayerBar } from "./PlayerBar";
import { createPlaylistFlow } from "./playlistActions";
import { PlaylistScreen } from "./PlaylistScreen";
import { QueueScreen } from "./QueueScreen";
import { links, navigate, useRoute, type Route } from "./router";
import { SearchInput, SearchScreen } from "./SearchScreen";
import { SettingsScreen } from "./SettingsScreen";
import { useKeyboardShortcuts } from "./shortcuts";

/** A screen another step fills in. */
function Pending({ title }: { title: string }) {
  return (
    <div className="screen">
      <h1>{title}</h1>
      <p className="muted">Coming soon.</p>
    </div>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "home":
      return <HomeScreen />;
    case "search":
      return <SearchScreen tab={route.tab} />;
    case "artist":
      return <ArtistScreen id={route.id} />;
    case "album":
      return <AlbumScreen id={route.id} />;
    case "playlist":
      return <PlaylistScreen id={route.id} />;
    case "library":
      return <LibraryScreen />;
    case "liked":
      return <LikedScreen />;
    case "queue":
      return <QueueScreen />;
    case "addons":
      return <AddonsScreen />;
    case "settings":
      return <SettingsScreen />;
    case "account":
      return <AccountScreen />;
    case "user":
      return <Pending title={route.username} />;
    case "admin":
      return <Pending title="Admin" />;
    case "stats":
      return <Pending title="Your stats" />;
  }
}

type Section = "home" | "search" | "library";

function sectionOf(route: Route): Section | null {
  if (route.name === "home" || route.name === "search" || route.name === "library") return route.name;
  if (route.name === "liked" || route.name === "playlist") return "library";
  return null;
}

const SECTIONS: { name: Section; label: string; href: string; icon: IconName }[] = [
  { name: "home", label: "Home", href: links.home, icon: "home" },
  { name: "search", label: "Search", href: links.search, icon: "search" },
  { name: "library", label: "Your Library", href: links.library, icon: "library" },
];

function Sidebar({ route }: { route: Route }) {
  const section = sectionOf(route);
  const { playlists, followedPlaylists, likedCount } = useLibrary();
  const openId = route.name === "playlist" ? route.id : null;
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="side-panel side-nav">
        {SECTIONS.slice(0, 2).map((item) => (
          <a key={item.name} href={item.href} className={item.name === section ? "side-link active" : "side-link"}>
            <Icon name={item.icon} />
            {item.label}
          </a>
        ))}
      </div>
      <div className="side-panel side-library">
        <header className="side-library-head">
          <a href={links.library} className={section === "library" ? "side-link active" : "side-link"}>
            <Icon name="library" />
            Your Library
          </a>
          <IconButton icon="add" label="Create playlist" onClick={() => void createPlaylistFlow()} />
        </header>
        <ul className="side-items">
          <li>
            <a href={links.liked} className={route.name === "liked" ? "side-item active" : "side-item"}>
              <LikedCover />
              <span className="side-item-text">
                <span className="side-item-title">Liked songs</span>
                <span className="muted">Playlist · {count(likedCount, "song")}</span>
              </span>
            </a>
          </li>
          {[...playlists, ...followedPlaylists].map((p) => (
            <li key={p.id}>
              <a href={links.playlist(p.id)} className={p.id === openId ? "side-item active" : "side-item"}>
                <Mosaic covers={p.covers} />
                <span className="side-item-text">
                  <span className="side-item-title">{p.name}</span>
                  <span className="muted">Playlist · {p.owner.displayName}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        {playlists.length === 0 && (
          <div className="side-hint">
            <strong>Create your first playlist</strong>
            <button className="button small" onClick={() => void createPlaylistFlow()}>
              Create playlist
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

function AccountButton() {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  const open = (event: React.MouseEvent<HTMLButtonElement>) => {
    const items: MenuItem[] = [
      { label: "Profile", icon: "user", href: links.user(user.username) },
      { label: "Account", href: links.account },
      { label: "Your stats", href: links.stats },
      { label: "Add-ons", href: links.addons },
      { label: "Settings", href: links.settings },
    ];
    if (user.isAdmin) items.push({ label: "Admin", href: links.admin });
    items.push("separator", { label: "Sign out", onSelect: () => void useAuth.getState().logout() });
    openMenu(event.currentTarget, { header: <strong>{user.displayName}</strong>, items });
  };
  return (
    <button className="avatar" onClick={open} aria-label="Account menu" title={user.displayName}>
      {user.displayName.slice(0, 1).toUpperCase()}
    </button>
  );
}

function TopBar({ route }: { route: Route }) {
  return (
    <header className="topbar">
      <span className="topbar-history">
        <IconButton icon="back" label="Go back" onClick={() => window.history.back()} />
        <IconButton icon="chevron" label="Go forward" onClick={() => window.history.forward()} />
      </span>
      {route.name === "search" && <SearchInput />}
      <span className="topbar-end">
        <AccountButton />
      </span>
    </header>
  );
}

/** Where tapping the mini player goes; the full-screen Now Playing view replaces this. */
export function openNowPlaying(): void {
  navigate(links.queue);
}

function MiniPlayer() {
  const item = usePlayback((s) => currentItem(s.queue));
  const busy = usePlayback((s) => s.player.status === "playing" || s.player.status === "loading");
  const progress = usePlayback((s) => (s.player.duration ? s.player.position / s.player.duration : 0));
  if (!item) return null;
  const { track } = item;
  return (
    <div className="mini-player" onClick={(event) => !(event.target as Element).closest("button, a") && openNowPlaying()}>
      <Cover src={track.album?.cover} />
      <span className="mini-text">
        <span className="trow-title">{track.title}</span>
        <span className="trow-sub">
          <ArtistLinks artists={track.artists} />
        </span>
      </span>
      <LikeButton track={track} />
      <IconButton icon={busy ? "pause" : "play"} label={busy ? "Pause" : "Play"} onClick={usePlayback.getState().toggle} />
      <span className="mini-progress" style={{ width: `${Math.min(progress, 1) * 100}%` }} />
    </div>
  );
}

function TabBar({ route }: { route: Route }) {
  const section = sectionOf(route);
  return (
    <nav className="tabbar" aria-label="Main">
      {SECTIONS.map((item) => (
        <a key={item.name} href={item.href} className={item.name === section ? "active" : undefined}>
          <Icon name={item.icon} />
          <span>{item.name === "library" ? "Library" : item.label}</span>
        </a>
      ))}
    </nav>
  );
}

function Shell() {
  const route = useRoute();
  useKeyboardShortcuts();
  return (
    <div className="app">
      <Sidebar route={route} />
      <main className="main" data-scroll-root>
        <TopBar route={route} />
        <Screen route={route} />
      </main>
      <PlayerBar />
      <div className="phone-dock">
        <MiniPlayer />
        <TabBar route={route} />
      </div>
      <Overlays />
    </div>
  );
}

/** Shows the sign-in screen until the user is signed in. */
export function App() {
  const status = useAuth((s) => s.status);
  if (status === "loading") return <p className="screen muted">Loading…</p>;
  if (status === "signedOut") return <AuthScreen />;
  return <Shell />;
}
