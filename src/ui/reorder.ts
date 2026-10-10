/**
 * Moving a group of list items (in any order) to before `beforeKey`, or to the
 * end when it is null. The moved items keep their relative order.
 */
export function moveKeys(keys: readonly string[], moved: readonly string[], beforeKey: string | null): string[] {
  const set = new Set(moved);
  const group = keys.filter((k) => set.has(k));
  const rest = keys.filter((k) => !set.has(k));
  const at = beforeKey === null ? rest.length : rest.indexOf(beforeKey);
  if (at < 0) return [...keys];
  return [...rest.slice(0, at), ...group, ...rest.slice(at)];
}

/**
 * Where a drop over `overKey` (its top half, or with `after` its bottom half)
 * puts the moved items: the key they go before (null for the end), or
 * undefined when the drop changes nothing.
 */
export function dropBefore(
  keys: readonly string[],
  moved: readonly string[],
  overKey: string,
  after: boolean,
): string | null | undefined {
  const set = new Set(moved);
  const start = keys.indexOf(overKey);
  if (start < 0 || moved.length === 0) return undefined;
  let before: string | null = null;
  for (let i = start + (after ? 1 : 0); i < keys.length; i++) {
    if (!set.has(keys[i])) {
      before = keys[i];
      break;
    }
  }
  const result = moveKeys(keys, moved, before);
  return result.every((k, i) => k === keys[i]) ? undefined : before;
}
