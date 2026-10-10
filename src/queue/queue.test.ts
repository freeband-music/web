import { expect, test } from "vitest";
import { currentItem, next, playFrom, remove } from "./queue";

test("play album from index sets order and current", () => {
  const queue = playFrom(["a", "b", "c"], 1);
  expect(queue.items).toEqual(["a", "b", "c"]);
  expect(currentItem(queue)).toBe("b");
});

test("next at the end stops", () => {
  const queue = playFrom(["a", "b"], 0);
  const second = next(queue);
  expect(second && currentItem(second)).toBe("b");
  expect(next(second!)).toBeNull();
});

test("removing an item before the current one keeps the same track current", () => {
  const queue = remove(playFrom(["a", "b", "c"], 2), 0);
  expect(queue.items).toEqual(["b", "c"]);
  expect(currentItem(queue)).toBe("c");
});
