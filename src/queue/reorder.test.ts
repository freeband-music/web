import { describe, expect, it } from "vitest";
import { dropBefore, moveKeys } from "./reorder";

describe("reorder", () => {
  const keys = ["a", "b", "c", "d", "e"];

  it("moves a group before a key, keeping its order", () => {
    expect(moveKeys(keys, ["d", "b"], "a")).toEqual(["b", "d", "a", "c", "e"]);
    expect(moveKeys(keys, ["a", "c"], null)).toEqual(["b", "d", "e", "a", "c"]);
  });

  it("finds the drop target and ignores drops that change nothing", () => {
    expect(dropBefore(keys, ["a"], "c", true)).toBe("d");
    expect(dropBefore(keys, ["b", "c"], "e", true)).toBeNull();
    expect(dropBefore(keys, ["b", "c"], "c", false)).toBeUndefined();
    expect(dropBefore(keys, ["b"], "a", true)).toBeUndefined();
    expect(dropBefore(keys, ["a", "c"], "b", true)).toBe("d");
  });
});
