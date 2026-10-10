import { expect, it } from "vitest";
import { describeUserAgent } from "./format";

it("names the browser and system of a user agent", () => {
  const chrome = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  expect(describeUserAgent(chrome)).toBe("Chrome on Linux");
  expect(describeUserAgent(iphone)).toBe("Safari on iOS");
  expect(describeUserAgent(null)).toBe("Unknown device");
});
