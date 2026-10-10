/** How a click changes a list selection: plain click, Ctrl/Cmd-click, Shift-click. */
export type SelectMode = "single" | "toggle" | "range";

/**
 * The selection after clicking `keys[index]`. `anchor` is the index of the
 * last plain or toggle click (the start of a Shift range).
 */
export function nextSelection(
  selected: ReadonlySet<string>,
  keys: readonly string[],
  index: number,
  anchor: number | null,
  mode: SelectMode,
): Set<string> {
  const key = keys[index];
  if (mode === "toggle") {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }
  if (mode === "range" && anchor !== null && anchor < keys.length) {
    const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
    return new Set(keys.slice(from, to + 1));
  }
  return new Set([key]);
}
