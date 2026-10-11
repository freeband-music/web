import { expect, test } from "vitest";
import { mergeById } from "./service";

test("merging keeps each add-on's order and interleaves by popularity", () => {
  const a = [{ id: "a1", popularity: 30 }, { id: "a2", popularity: 90 }, { id: "x" }];
  const b = [{ id: "b1", popularity: 50 }, { id: "x", popularity: 99 }];
  expect(mergeById([a, b, "not a list"]).map((i) => i.id)).toEqual(["b1", "x", "a1", "a2"]);
});

test("an add-on without popularity takes turns instead of going last", () => {
  const scored = [{ id: "d1", popularity: 90 }, { id: "d2", popularity: 80 }, { id: "d3", popularity: 70 }];
  const plain = [{ id: "m1" }, { id: "m2" }];
  expect(mergeById([scored, plain]).map((i) => i.id)).toEqual(["d1", "m1", "d2", "m2", "d3"]);
});
