import { expect, test } from "vitest";
import { hashPassword, verifyPassword } from "./password";

test("hashes are salted and verify only the right password", async () => {
  const a = await hashPassword("correct horse");
  const b = await hashPassword("correct horse");
  expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
  expect(a).not.toBe(b);
  expect(await verifyPassword("correct horse", a)).toBe(true);
  expect(await verifyPassword("wrong horse", a)).toBe(false);
  expect(await verifyPassword("correct horse", "garbage")).toBe(false);
});
