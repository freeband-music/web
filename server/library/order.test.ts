import { expect, test } from "vitest";
import { changedPositions, insertAt, moveEntries } from "./order";

test("moves entries before an anchor, to the end, and past themselves", () => {
  const order = ["a", "b", "c", "d", "e"];
  expect(moveEntries(order, ["d", "b"], "a")).toEqual(["b", "d", "a", "c", "e"]);
  expect(moveEntries(order, ["a", "c"], null)).toEqual(["b", "d", "e", "a", "c"]);
  expect(moveEntries(order, ["a", "c"], "c")).toEqual(["b", "a", "c", "d", "e"]);
  expect(moveEntries(order, ["e"], "e")).toEqual(order);
  expect(insertAt(["a", "b"], ["x"], 1)).toEqual(["a", "x", "b"]);
  expect(changedPositions(order, moveEntries(order, ["a"], "c"))).toEqual([
    { id: "b", position: 0 },
    { id: "a", position: 1 },
  ]);
});
