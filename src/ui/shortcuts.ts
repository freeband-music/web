import { useEffect } from "react";
import { usePlayback } from "../store/playback";
import { links, navigate } from "./router";

const SEEK_SECONDS = 10;
const VOLUME_STEP = 0.1;
/** The element `/` focuses; the search screen marks its input with this attribute. */
export const SEARCH_INPUT_ATTR = "data-search-input";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !["range", "checkbox", "radio", "button"].includes(target.type);
}

/** Dialogs and menus get the keyboard to themselves. */
const overlayOpen = () => document.querySelector(".modal, .menu") !== null;

function focusSearch() {
  const find = () => document.querySelector<HTMLInputElement>(`[${SEARCH_INPUT_ATTR}]`);
  const input = find();
  if (input) {
    input.focus();
    input.select();
    return;
  }
  navigate(links.search);
  requestAnimationFrame(() => find()?.focus());
}

/**
 * Space play/pause, ←/→ seek 10 s, Shift+←/→ previous/next, ↑/↓ volume,
 * `/` focus search. Ignored while typing in a field and while a dialog or menu is open.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || overlayOpen()) return;
      const playback = usePlayback.getState();
      const handlers: Record<string, () => void> = {
        " ": playback.toggle,
        ArrowLeft: () => (event.shiftKey ? playback.previous() : playback.seekBy(-SEEK_SECONDS)),
        ArrowRight: () => (event.shiftKey ? playback.next() : playback.seekBy(SEEK_SECONDS)),
        ArrowUp: () => playback.setVolume(playback.volume + VOLUME_STEP),
        ArrowDown: () => playback.setVolume(playback.volume - VOLUME_STEP),
        "/": focusSearch,
      };
      const handler = handlers[event.key];
      if (!handler) return;
      // A focused button would also react to Space.
      if (event.key === " " && event.target instanceof HTMLButtonElement) event.target.blur();
      event.preventDefault();
      handler();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
