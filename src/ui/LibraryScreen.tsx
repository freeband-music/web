import { useState } from "react";
import { history } from "../api/client";
import { useLibrary } from "../store/library";
import { Card, CardGrid, Chips } from "./cards";
import { count, Cover, IconButton, LikedCover, Mosaic, useAsync } from "./common";
import { libraryItems, matchesFilter, sortLibrary, type LibraryItem, type LibraryKind, type LibrarySort } from "./libraryModel";
import { playContext, playLiked } from "./play";
import { createPlaylistFlow } from "./playlistActions";
import { links } from "./router";

const VIEW_KEY = "freeband.library.view";
const KINDS: { value: LibraryKind; label: string }[] = [
  { value: "playlist", label: "Playlists" },
  { value: "album", label: "Albums" },
  { value: "artist", label: "Artists" },
];
const SORTS: { value: LibrarySort; label: string }[] = [
  { value: "recent", label: "Recents" },
  { value: "added", label: "Recently added" },
  { value: "alphabetical", label: "Alphabetical" },
];

function readView(): "list" | "grid" {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function itemCover(item: LibraryItem) {
  if (item.kind === "liked") return <LikedCover />;
  if (item.kind === "playlist") return <Mosaic covers={item.covers} />;
  return <Cover src={item.covers[0]} round={item.kind === "artist"} />;
}

const itemHref = (item: LibraryItem) => (item.kind === "liked" ? links.liked : links[item.kind](item.id));
const itemPlay = (item: LibraryItem) => (item.kind === "liked" ? playLiked() : playContext(item.kind, item.id));

export function LibraryScreen() {
  const { playlists, followedPlaylists, albums, artists, likedCount } = useLibrary();
  const recent = useAsync(() => history.recent(), "recent");
  const [kind, setKind] = useState<LibraryKind | null>(null);
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [filter, setFilter] = useState("");
  const [view, setView] = useState(readView);

  const toggleView = () => {
    const next = view === "list" ? "grid" : "list";
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Only a convenience.
    }
  };

  const contexts = !recent.loading && "data" in recent ? recent.data.contexts : [];
  const all = sortLibrary(libraryItems({ playlists, followedPlaylists, albums, artists, recent: contexts }), sort);
  const liked: LibraryItem = {
    kind: "liked",
    id: "liked",
    title: "Liked songs",
    subtitle: `Playlist · ${count(likedCount, "song")}`,
    covers: [],
    addedAt: "",
  };
  const items = [...(kind === null || kind === "playlist" ? [liked] : []), ...all].filter(
    (i) => (kind === null || i.kind === kind || i.kind === "liked") && matchesFilter(filter, i.title, i.subtitle),
  );

  return (
    <div className="screen">
      <header className="title-row">
        <h1>Your Library</h1>
        <IconButton icon="add" label="Create playlist" onClick={() => void createPlaylistFlow()} />
      </header>
      <Chips<LibraryKind> options={KINDS} value={kind} onChange={setKind} clearable />
      <div className="library-tools">
        <input
          type="search"
          className="filter-box"
          placeholder="Search in Your Library"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Filter"
        />
        <select className="select" value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)} aria-label="Sort by">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <IconButton icon={view === "list" ? "grid" : "list"} label={view === "list" ? "Grid view" : "List view"} onClick={toggleView} />
      </div>
      {items.length === 0 && <p className="muted">{filter ? `Nothing matches “${filter}”.` : "Nothing here yet."}</p>}
      {view === "grid" ? (
        <CardGrid>
          {items.map((item) => (
            <Card
              key={`${item.kind}:${item.id}`}
              href={itemHref(item)}
              cover={itemCover(item)}
              title={item.title}
              subtitle={item.subtitle}
              round={item.kind === "artist"}
              onPlay={() => itemPlay(item)}
            />
          ))}
        </CardGrid>
      ) : (
        <ul className="side-items library-list">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <a href={itemHref(item)} className="side-item">
                {itemCover(item)}
                <span className="side-item-text">
                  <span className="side-item-title">{item.title}</span>
                  <span className="muted">{item.subtitle}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
