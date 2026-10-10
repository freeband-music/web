import { useSyncExternalStore } from "react";

export type Route =
  | { name: "search" | "queue" | "library" | "addons" | "settings" | "account" }
  | { name: "artist" | "album" | "playlist"; id: string };

const PAGES = ["search", "queue", "library", "addons", "settings", "account"] as const;
const ITEMS = ["artist", "album", "playlist"] as const;

/** IDs contain colons and other reserved characters, so they are always encoded. */
export const links = {
  search: "/search",
  queue: "/queue",
  library: "/library",
  addons: "/addons",
  settings: "/settings",
  account: "/account",
  artist: (id: string) => `/artist/${encodeURIComponent(id)}`,
  album: (id: string) => `/album/${encodeURIComponent(id)}`,
  playlist: (id: string) => `/playlist/${encodeURIComponent(id)}`,
};

export function parsePath(path: string): Route {
  const [name, ...rest] = path.replace(/^\/+/, "").split("/");
  if ((PAGES as readonly string[]).includes(name)) return { name: name as (typeof PAGES)[number] };
  if ((ITEMS as readonly string[]).includes(name) && rest.length > 0) {
    try {
      return { name: name as (typeof ITEMS)[number], id: decodeURIComponent(rest.join("/")) };
    } catch {
      return { name: "search" };
    }
  }
  return { name: "search" };
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function navigate(path: string, replace = false): void {
  if (path === window.location.pathname) return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
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
