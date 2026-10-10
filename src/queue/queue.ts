/**
 * Pure queue logic: items in play order and the index of the current item
 * (-1 for none). With shuffle on, `order` lists the items' indexes in their
 * unshuffled order, so shuffle can be undone.
 */
export interface Queue<T> {
  items: T[];
  current: number;
  order?: number[];
}

export type Repeat = "off" | "all" | "one";

export function emptyQueue<T>(): Queue<T> {
  return { items: [], current: -1 };
}

/** Replaces the queue with an album (or any list) and makes `index` current. */
export function playFrom<T>(items: T[], index: number): Queue<T> {
  if (items.length === 0) return emptyQueue();
  return { items: [...items], current: Math.min(Math.max(index, 0), items.length - 1) };
}

/** Re-arranges items: `source[i]` is the old index of the item now at `i`. Keeps the current item and `order`. */
function rearrange<T>(queue: Queue<T>, source: number[]): Queue<T> {
  const newIndex = new Map<number, number>();
  source.forEach((old, i) => newIndex.set(old, i));
  const result: Queue<T> = {
    items: source.map((old) => queue.items[old]),
    current: queue.current < 0 ? -1 : (newIndex.get(queue.current) ?? -1),
  };
  if (queue.order) result.order = queue.order.filter((old) => newIndex.has(old)).map((old) => newIndex.get(old)!);
  return result;
}

/** Re-arranges items by old index (`source[i]` is the item now at `i`); the current item stays current. */
export const reorder = <T>(queue: Queue<T>, source: number[]): Queue<T> => rearrange(queue, source);

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * Inserts items at a play-order position (default the end). With shuffle on
 * they also go to the matching place in the unshuffled order: right after the
 * item before them.
 */
export function insert<T>(queue: Queue<T>, items: T[], at = queue.items.length): Queue<T> {
  const n = items.length;
  if (n === 0) return queue;
  at = Math.min(Math.max(at, 0), queue.items.length);
  const shift = (i: number) => (i >= at ? i + n : i);
  const added = range(n).map((i) => at + i);
  let order: number[] | undefined;
  if (queue.order) {
    order = queue.order.map(shift);
    const after = at === 0 ? -1 : order.indexOf(at - 1);
    order.splice(after + 1, 0, ...added);
  }
  const all = [...queue.items.slice(0, at), ...items, ...queue.items.slice(at)];
  const current = queue.current < 0 ? -1 : shift(queue.current);
  return order ? { items: all, current, order } : { items: all, current };
}

export const add = <T>(queue: Queue<T>, items: T[]) => insert(queue, items);

/** Inserts items right after the current one. */
export const insertNext = <T>(queue: Queue<T>, items: T[]) => insert(queue, items, queue.current + 1);

/**
 * The index after the current one, or null at the end. `auto` means the
 * current track finished on its own: repeat-one then plays it again.
 */
export function nextIndex(queue: Queue<unknown>, repeat: Repeat, auto = false): number | null {
  const { current, items } = queue;
  if (current < 0 || items.length === 0) return null;
  if (auto && repeat === "one") return current;
  if (current < items.length - 1) return current + 1;
  return repeat === "off" ? null : 0;
}

export function previousIndex(queue: Queue<unknown>, repeat: Repeat): number | null {
  const { current, items } = queue;
  if (current > 0) return current - 1;
  return current === 0 && repeat !== "off" && items.length > 1 ? items.length - 1 : null;
}

/** The items still to play after the current one, in play order (wrapping round with repeat on). */
export function upcoming<T>(queue: Queue<T>, repeat: Repeat): T[] {
  const after = queue.items.slice(queue.current + 1);
  return repeat === "off" || queue.current < 0 ? after : [...after, ...queue.items.slice(0, queue.current)];
}

export function jump<T>(queue: Queue<T>, index: number): Queue<T> {
  if (index < 0 || index >= queue.items.length) return queue;
  return { ...queue, current: index };
}

/**
 * Removes one item. The current item stays current; if it is the one removed,
 * the item that followed it becomes current (or none when it was the last).
 */
export function remove<T>(queue: Queue<T>, index: number): Queue<T> {
  if (index < 0 || index >= queue.items.length) return queue;
  const result = rearrange({ ...queue, current: -1 }, range(queue.items.length).filter((i) => i !== index));
  let current = queue.current;
  if (index < current) current -= 1;
  else if (index === current && current >= result.items.length) current = -1;
  return { ...result, current };
}

/** Moves an item; the current item stays current wherever it ends up. */
export function move<T>(queue: Queue<T>, from: number, to: number): Queue<T> {
  const last = queue.items.length - 1;
  if (from < 0 || from > last || to < 0 || to > last || from === to) return queue;
  const source = range(queue.items.length);
  source.splice(to, 0, ...source.splice(from, 1));
  return rearrange(queue, source);
}

/** Shuffles the queue with the current item first; `random` returns [0, 1). */
export function shuffle<T>(queue: Queue<T>, random: () => number = Math.random): Queue<T> {
  if (queue.order) return queue;
  const rest = range(queue.items.length).filter((i) => i !== queue.current);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const source = queue.current < 0 ? rest : [queue.current, ...rest];
  return rearrange({ ...queue, order: range(queue.items.length) }, source);
}

/** Puts the items back in their unshuffled order. */
export function unshuffle<T>(queue: Queue<T>): Queue<T> {
  if (!queue.order) return queue;
  const { order, ...plain } = queue;
  return rearrange(plain, order);
}

export function currentItem<T>(queue: Queue<T>): T | undefined {
  return queue.items[queue.current];
}
