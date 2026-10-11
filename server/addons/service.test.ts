import { expect, test } from "vitest";
import { mergeById } from "./service";

test("merging keeps each add-on's order and interleaves by popularity", () => {
  const a = [{ id: "a1", popularity: 30 }, { id: "a2", popularity: 90 }, { id: "x" }];
  const b = [{ id: "b1", popularity: 50 }, { id: "x", popularity: 99 }];
  expect(mergeById([a, b, "not a list"]).map((i) => i.id)).toEqual(["b1", "x", "a1", "a2"]);
});
