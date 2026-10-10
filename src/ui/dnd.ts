// Drag-and-drop reordering of list rows: native HTML5 drag and drop with a
// mouse, and pointer events on a drag handle (`data-drag-handle`) for touch.

import { useRef, useState, type DragEvent, type HTMLAttributes, type PointerEvent } from "react";
import { dropBefore } from "./reorder";

interface DragState {
  moved: string[];
  over?: string;
  after?: boolean;
  /** A touch drag on a handle (pointer events), not a native one. */
  pointer?: boolean;
}

const EDGE = 64;
const SCROLL_STEP = 12;

function rowAt(x: number, y: number, list: Element | null): HTMLElement | null {
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-row-key]");
  return row && list?.contains(row) ? row : null;
}

const isAfter = (row: Element, y: number) => {
  const rect = row.getBoundingClientRect();
  return y > rect.top + rect.height / 2;
};

/** Scrolls the main area while a touch drag is near its top or bottom edge. */
function autoScroll(y: number) {
  const root = document.querySelector("[data-scroll-root]");
  if (!root) return;
  const rect = root.getBoundingClientRect();
  if (y < rect.top + EDGE) root.scrollBy(0, -SCROLL_STEP);
  else if (y > rect.bottom - EDGE) root.scrollBy(0, SCROLL_STEP);
}

/**
 * Row attributes that make `keys` reorderable. A drag moves the whole
 * selection when it starts on a selected row; `onMove` gets the moved keys
 * and the key they go before (null for the end).
 */
export function useRowDrag(options: {
  keys: string[];
  selected: ReadonlySet<string>;
  enabled: boolean;
  onMove(moved: string[], beforeKey: string | null): void;
}): (key: string) => HTMLAttributes<HTMLLIElement> {
  const [drag, setDragState] = useState<DragState | null>(null);
  const current = useRef<DragState | null>(null);
  const setDrag = (state: DragState | null) => {
    current.current = state;
    setDragState(state);
  };
  const latest = useRef(options);
  latest.current = options;

  const movedFor = (key: string) => {
    const { keys, selected } = latest.current;
    return selected.has(key) ? keys.filter((k) => selected.has(k)) : [key];
  };

  function finish() {
    const state = current.current;
    setDrag(null);
    if (!state?.over) return;
    const before = dropBefore(latest.current.keys, state.moved, state.over, state.after === true);
    if (before !== undefined) latest.current.onMove(state.moved, before);
  }

  function hover(key: string, after: boolean) {
    const state = current.current;
    if (state && (state.over !== key || state.after !== after)) setDrag({ ...state, over: key, after });
  }

  return (key: string) => {
    const base: Record<string, unknown> = { "data-row-key": key };
    if (!options.enabled) return base as HTMLAttributes<HTMLLIElement>;
    if (drag?.moved.includes(key)) base["data-dragging"] = "";
    if (drag?.over === key) base["data-drop"] = drag.after ? "after" : "before";
    const handlers: HTMLAttributes<HTMLLIElement> = {
      draggable: true,
      onDragStart(event: DragEvent<HTMLLIElement>) {
        const moved = movedFor(key);
        setDrag({ moved });
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", moved.length === 1 ? "1 track" : `${moved.length} tracks`);
        if (moved.length > 1) {
          const ghost = document.createElement("div");
          ghost.className = "drag-ghost";
          ghost.textContent = `${moved.length} tracks`;
          document.body.append(ghost);
          event.dataTransfer.setDragImage(ghost, 16, 16);
          setTimeout(() => ghost.remove(), 0);
        }
      },
      onDragOver(event: DragEvent<HTMLLIElement>) {
        if (!current.current) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        hover(key, isAfter(event.currentTarget, event.clientY));
      },
      onDrop(event: DragEvent<HTMLLIElement>) {
        if (!current.current) return;
        event.preventDefault();
        finish();
      },
      onDragEnd: () => setDrag(null),
      onPointerDown(event: PointerEvent<HTMLLIElement>) {
        const handle = (event.target as Element).closest("[data-drag-handle]");
        if (!handle || event.button !== 0) return;
        event.preventDefault();
        (handle as HTMLElement).setPointerCapture(event.pointerId);
        setDrag({ moved: movedFor(key), over: key, after: false, pointer: true });
      },
      onPointerMove(event: PointerEvent<HTMLLIElement>) {
        if (!current.current?.pointer) return;
        autoScroll(event.clientY);
        const row = rowAt(event.clientX, event.clientY, event.currentTarget.parentElement);
        const over = row?.dataset.rowKey;
        if (row && over !== undefined) hover(over, isAfter(row, event.clientY));
      },
      onPointerUp() {
        if (current.current?.pointer) finish();
      },
      onPointerCancel: () => current.current?.pointer && setDrag(null),
    };
    return { ...base, ...handlers } as HTMLAttributes<HTMLLIElement>;
  };
}
