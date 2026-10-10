// Playlist order. Entries keep dense 0-based integer positions; every change
// computes the new order of entry IDs and rewrites only the positions that moved.

/** Inserts `ids` at `position` (clamped; default the end). */
export function insertAt(order: string[], ids: string[], position?: number): string[] {
  const at = position === undefined ? order.length : Math.max(0, Math.min(position, order.length));
  return [...order.slice(0, at), ...ids, ...order.slice(at)];
}

/**
 * Moves `moving` (in their current relative order) to just before
 * `beforeId`, or to the end when it is null or unknown. When `beforeId` is
 * itself being moved, the entries land before the next entry that is not.
 */
export function moveEntries(order: string[], moving: string[], beforeId: string | null): string[] {
  const set = new Set(moving);
  let anchor: string | null = null;
  if (beforeId !== null) {
    const start = order.indexOf(beforeId);
    if (start >= 0) anchor = order.slice(start).find((id) => !set.has(id)) ?? null;
  }
  const moved = order.filter((id) => set.has(id));
  const rest = order.filter((id) => !set.has(id));
  return insertAt(rest, moved, anchor === null ? rest.length : rest.indexOf(anchor));
}

/** The entries whose position differs between two orders (positions are indexes in `next`). */
export function changedPositions(previous: string[], next: string[]): { id: string; position: number }[] {
  const before = new Map(previous.map((id, i) => [id, i]));
  return next.flatMap((id, position) => (before.get(id) === position ? [] : [{ id, position }]));
}
