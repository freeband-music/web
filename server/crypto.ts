import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

/** Encrypts text with AES-256-GCM. Output: `v1.<iv>.<tag>.<ciphertext>`, base64url parts. */
export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Decrypts the output of `encrypt`; throws if the data was altered or the key is wrong. */
export function decrypt(sealed: string, key: Buffer): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || iv === undefined || tag === undefined || data === undefined) {
    throw new Error("Unrecognised encrypted value");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
