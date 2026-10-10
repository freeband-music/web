import { expect, test } from "vitest";
import { UnsupportedProtocolError, validateManifest } from "./http";
import { toFailure } from "./service";

test("a manifest with another protocol major version is reported as unsupported", () => {
  const manifest = { id: "x", name: "X", version: "1", protocolVersion: "1.2.0", resources: ["search"], idPrefixes: [] };
  let error: unknown;
  try {
    validateManifest(manifest);
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(UnsupportedProtocolError);
  expect(toFailure("id", "X", error)).toMatchObject({ code: "unsupported_protocol", protocolVersion: "1.2.0" });
});
