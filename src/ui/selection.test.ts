import { describe, expect, it } from "vitest";
import { nextSelection } from "./selection";

describe("nextSelection", () => {
  const keys = ["a", "b", "c", "d"];

  it("selects one row, toggles with Ctrl and extends a range with Shift", () => {
    const one = nextSelection(new Set(), keys, 1, null, "single");
    expect([...one]).toEqual(["b"]);
    const toggled = nextSelection(one, keys, 3, 1, "toggle");
    expect([...toggled].sort()).toEqual(["b", "d"]);
    expect([...nextSelection(toggled, keys, 0, 2, "range")]).toEqual(["a", "b", "c"]);
    expect([...nextSelection(toggled, keys, 3, 3, "toggle")]).toEqual(["b"]);
  });
});
