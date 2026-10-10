import { expect, test } from "vitest";
import { currentItem, insertNext, nextIndex, playFrom, previousIndex, remove, shuffle, unshuffle, upcoming } from "./queue";

test("play album from index sets order and current", () => {
  const queue = playFrom(["a", "b", "c"], 1);
  expect(queue.items).toEqual(["a", "b", "c"]);
  expect(currentItem(queue)).toBe("b");
});

test("removing an item before the current one keeps the same track current", () => {
  const queue = remove(playFrom(["a", "b", "c"], 2), 0);
  expect(queue.items).toEqual(["b", "c"]);
  expect(currentItem(queue)).toBe("c");
});

test("shuffle puts the current item first and unshuffle restores the order, keeping additions", () => {
  const shuffled = shuffle(playFrom(["a", "b", "c", "d"], 2), () => 0);
  expect(currentItem(shuffled)).toBe("c");
  expect(shuffled.current).toBe(0);
  const withNext = insertNext(shuffled, ["x"]);
  expect(withNext.items[1]).toBe("x");
  const plain = unshuffle(withNext);
  expect(plain.items).toEqual(["a", "b", "c", "x", "d"]);
  expect(currentItem(plain)).toBe("c");
});

test("next and previous follow repeat", () => {
  const queue = playFrom(["a", "b"], 1);
  expect(nextIndex(queue, "off")).toBeNull();
  expect(nextIndex(queue, "all")).toBe(0);
  expect(nextIndex(queue, "one", true)).toBe(1);
  expect(nextIndex(queue, "one")).toBe(0);
  expect(previousIndex(playFrom(["a", "b"], 0), "all")).toBe(1);
  expect(upcoming(playFrom(["a", "b", "c"], 1), "all")).toEqual(["c", "a"]);
});
