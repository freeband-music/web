import { expect, test } from "vitest";
import { downloadsPermitted } from "./settings";

test("downloads need both the server and the user to allow them", () => {
  expect(downloadsPermitted(false, {})).toBe(false);
  expect(downloadsPermitted(false, { allowDownloads: true })).toBe(false);
  expect(downloadsPermitted(true, {})).toBe(false);
  expect(downloadsPermitted(true, { allowDownloads: "yes" })).toBe(false);
  expect(downloadsPermitted(true, { allowDownloads: true })).toBe(true);
});
