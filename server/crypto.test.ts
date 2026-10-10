import { randomBytes } from "node:crypto";
import { expect, test } from "vitest";
import { decrypt, encrypt } from "./crypto";

test("encrypt and decrypt round trip; tampering or a wrong key fails", () => {
  const key = randomBytes(32);
  const sealed = encrypt("https://example.test/secret/manifest.json", key);
  expect(sealed).not.toContain("example");
  expect(decrypt(sealed, key)).toBe("https://example.test/secret/manifest.json");
  expect(() => decrypt(sealed, randomBytes(32))).toThrow();
  const parts = sealed.split(".");
  parts[3] = Buffer.from("altered").toString("base64url");
  expect(() => decrypt(parts.join("."), key)).toThrow();
});
