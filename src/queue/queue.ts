/** Pure queue logic: an ordered list and the index of the current item (-1 for none). */
export interface Queue<T> {
  items: T[];
  current: number;
}

export function emptyQueue<T>(): Queue<T> {
  return { items: [], current: -1 };
}

/** Replaces the queue with an album (or any list) and makes `index` current. */
export function playFrom<T>(items: T[], index: number): Queue<T> {
  if (items.length === 0) return emptyQueue();
  return { items: [...items], current: Math.min(Math.max(index, 0), items.length - 1) };
}

export function add<T>(queue: Queue<T>, items: T[]): Queue<T> {
  return { ...queue, items: [...queue.items, ...items] };
}

/** The queue moved to the next item, or null when the current item is the last. */
export function next<T>(queue: Queue<T>): Queue<T> | null {
  if (queue.current < 0 || queue.current >= queue.items.length - 1) return null;
  return { ...queue, current: queue.current + 1 };
}

/** The queue moved to the previous item, or null when there is none. */
export function previous<T>(queue: Queue<T>): Queue<T> | null {
  if (queue.current <= 0) return null;
  return { ...queue, current: queue.current - 1 };
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
  const items = queue.items.filter((_, i) => i !== index);
  let current = queue.current;
  if (index < current) current -= 1;
  else if (index === current && current >= items.length) current = -1;
  return { items, current };
}

/** Moves an item; the current item stays current wherever it ends up. */
export function move<T>(queue: Queue<T>, from: number, to: number): Queue<T> {
  const last = queue.items.length - 1;
  if (from < 0 || from > last || to < 0 || to > last || from === to) return queue;
  const items = [...queue.items];
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  let current = queue.current;
  if (current === from) current = to;
  else if (from < current && to >= current) current -= 1;
  else if (from > current && to <= current) current += 1;
  return { items, current };
}

export function currentItem<T>(queue: Queue<T>): T | undefined {
  return queue.items[queue.current];
}
