import { expect, test } from "vitest";
import { isPrivateAddress } from "./network";

test("classifies loopback, private, link-local, CGNAT and unspecified addresses", () => {
  const blocked = ["127.0.0.1", "10.1.2.3", "172.31.0.1", "192.168.1.10", "169.254.1.1", "100.100.0.1", "0.0.0.0"];
  const blocked6 = ["::1", "::", "fd12::1", "fe80::1%eth0", "::ffff:192.168.0.1", "::ffff:7f00:1"];
  const open = ["8.8.8.8", "172.32.0.1", "100.128.0.1", "2001:4860::8888", "::ffff:8.8.8.8"];
  for (const ip of [...blocked, ...blocked6]) expect(isPrivateAddress(ip), ip).toBe(true);
  for (const ip of open) expect(isPrivateAddress(ip), ip).toBe(false);
});
