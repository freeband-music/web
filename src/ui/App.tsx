import { useAuth } from "../store/auth";
import { AccountScreen } from "./AccountScreen";
import { AddonsScreen } from "./AddonsScreen";
import { AlbumScreen } from "./AlbumScreen";
import { ArtistScreen } from "./ArtistScreen";
import { AuthScreen } from "./AuthScreen";
import { LibraryScreen } from "./LibraryScreen";
import { PlayerBar } from "./PlayerBar";
import { PlaylistScreen } from "./PlaylistScreen";
import { QueueScreen } from "./QueueScreen";
import { links, useRoute, type Route } from "./router";
import { SearchScreen } from "./SearchScreen";
import { SettingsScreen } from "./SettingsScreen";
import { useKeyboardShortcuts } from "./shortcuts";

const NAV = [
  { name: "search", label: "Search", href: links.search },
  { name: "library", label: "Library", href: links.library },
  { name: "queue", label: "Queue", href: links.queue },
  { name: "addons", label: "Add-ons", href: links.addons },
  { name: "settings", label: "Settings", href: links.settings },
  { name: "account", label: "Account", href: links.account },
] as const;

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "artist":
      return <ArtistScreen id={route.id} />;
    case "album":
      return <AlbumScreen id={route.id} />;
    case "playlist":
      return <PlaylistScreen id={route.id} />;
    case "library":
      return <LibraryScreen />;
    case "queue":
      return <QueueScreen />;
    case "addons":
      return <AddonsScreen />;
    case "settings":
      return <SettingsScreen />;
    case "account":
      return <AccountScreen />;
    default:
      return <SearchScreen />;
  }
}

function Shell() {
  const route = useRoute();
  useKeyboardShortcuts();
  const section =
    route.name === "artist" || route.name === "album" ? "search" : route.name === "playlist" ? "library" : route.name;
  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">Freeband</div>
        {NAV.map((item) => (
          <a key={item.name} href={item.href} className={item.name === section ? "active" : undefined}>
            {item.label}
          </a>
        ))}
      </nav>
      <main className="main">
        <Screen route={route} />
      </main>
      <PlayerBar />
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
