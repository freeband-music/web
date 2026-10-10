import { AddonsScreen } from "./AddonsScreen";
import { AlbumScreen } from "./AlbumScreen";
import { ArtistScreen } from "./ArtistScreen";
import { PlayerBar } from "./PlayerBar";
import { QueueScreen } from "./QueueScreen";
import { links, useRoute, type Route } from "./router";
import { SearchScreen } from "./SearchScreen";
import { SettingsScreen } from "./SettingsScreen";

const NAV = [
  { name: "search", label: "Search", href: links.search },
  { name: "queue", label: "Queue", href: links.queue },
  { name: "addons", label: "Add-ons", href: links.addons },
  { name: "settings", label: "Settings", href: links.settings },
] as const;

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "artist":
      return <ArtistScreen id={route.id} />;
    case "album":
      return <AlbumScreen id={route.id} />;
    case "queue":
      return <QueueScreen />;
    case "addons":
      return <AddonsScreen />;
    case "settings":
      return <SettingsScreen />;
    default:
      return <SearchScreen />;
  }
}

export function App() {
  const route = useRoute();
  const section = route.name === "artist" || route.name === "album" ? "search" : route.name;
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
