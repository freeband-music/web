import { useSyncExternalStore } from "react";

/** The per-type lists of search results ("See all"). */
export const SEARCH_TABS = ["songs", "artists", "albums", "playlists"] as const;
export type SearchTab = (typeof SEARCH_TABS)[number];

export type Route =
  | { name: "home" | "library" | "liked" | "queue" | "addons" | "settings" | "account" | "admin" | "stats" }
  | { name: "search"; tab?: SearchTab }
  | { name: "artist" | "album" | "playlist"; id: string }
  | { name: "user"; username: string };

const PAGES = ["library", "liked", "queue", "addons", "settings", "account", "admin", "stats"] as const;
const ITEMS = ["artist", "album", "playlist"] as const;

/** IDs contain colons and other reserved characters, so they are always encoded. */
export const links = {
  home: "/",
  search: "/search",
  searchTab: (tab: SearchTab) => `/search/${tab}`,
  queue: "/queue",
  library: "/library",
  liked: "/liked",
  addons: "/addons",
  settings: "/settings",
  account: "/account",
  admin: "/admin",
  stats: "/stats",
  artist: (id: string) => `/artist/${encodeURIComponent(id)}`,
  album: (id: string) => `/album/${encodeURIComponent(id)}`,
  playlist: (id: string) => `/playlist/${encodeURIComponent(id)}`,
  user: (username: string) => `/user/${encodeURIComponent(username)}`,
};

export function parsePath(path: string): Route {
  const [name, ...rest] = path.replace(/^\/+/, "").split("/");
  if (name === "") return { name: "home" };
  if ((PAGES as readonly string[]).includes(name)) return { name: name as (typeof PAGES)[number] };
  if (name === "search") {
    const tab = SEARCH_TABS.find((t) => t === rest[0]);
    return tab ? { name: "search", tab } : { name: "search" };
  }
  if (rest.length === 0) return { name: "home" };
  let id: string;
  try {
    id = decodeURIComponent(rest.join("/"));
  } catch {
    return { name: "home" };
  }
  if ((ITEMS as readonly string[]).includes(name)) return { name: name as (typeof ITEMS)[number], id };
  if (name === "user") return { name: "user", username: id };
  return { name: "home" };
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function navigate(path: string, replace = false): void {
  if (path === window.location.pathname) return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  // The shell's main area is the scrolling element.
  document.querySelector("[data-scroll-root]")?.scrollTo(0, 0);
  window.scrollTo(0, 0);
  notify();
}

/** Routes clicks on same-origin links through `navigate`, and maps old `#/` links to paths. Call once. */
export function startRouter(): void {
  const { hash } = window.location;
  if (hash.startsWith("#/")) window.history.replaceState(null, "", hash.slice(1));
  window.addEventListener("popstate", notify);
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const anchor = (event.target as Element | null)?.closest?.("a");
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
    event.preventDefault();
    navigate(url.pathname + url.search);
  });
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useRoute(): Route {
  const path = useSyncExternalStore(subscribe, () => window.location.pathname);
  return parsePath(path);
}
