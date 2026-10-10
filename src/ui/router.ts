import { useSyncExternalStore } from "react";

export type Route =
  | { name: "search" | "queue" | "addons" | "settings" }
  | { name: "artist" | "album"; id: string };

/** IDs contain colons and other reserved characters, so they are always encoded. */
export const links = {
  search: "#/search",
  queue: "#/queue",
  addons: "#/addons",
  settings: "#/settings",
  artist: (id: string) => `#/artist/${encodeURIComponent(id)}`,
  album: (id: string) => `#/album/${encodeURIComponent(id)}`,
};

export function parseHash(hash: string): Route {
  const [name, ...rest] = hash.replace(/^#\/?/, "").split("/");
  if (name === "queue" || name === "addons" || name === "settings") return { name };
  if ((name === "artist" || name === "album") && rest.length > 0) {
    try {
      return { name, id: decodeURIComponent(rest.join("/")) };
    } catch {
      return { name: "search" };
    }
  }
  return { name: "search" };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
