import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AddonError, type FetchFn } from "./http";

/** Ranges that are not on the public internet, as [first address, prefix length]. */
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // unspecified, "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
}

function v4Blocked(ip: string): boolean {
  const n = v4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    return Math.floor(n / size) === Math.floor(v4ToInt(base) / size);
  });
}

/** The eight 16-bit groups of an IPv6 address (an embedded IPv4 tail becomes two groups). */
function v6Groups(ip: string): number[] {
  let text = ip.toLowerCase().split("%")[0];
  const v4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = v4ToInt(v4[1]);
    text = `${text.slice(0, -v4[1].length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const parse = (s: string | undefined) => (s ? s.split(":").map((g) => Number.parseInt(g, 16)) : []);
  const left = parse(head);
  const right = parse(tail);
  const fill = tail === undefined ? [] : new Array<number>(8 - left.length - right.length).fill(0);
  return [...left, ...fill, ...right];
}

/**
 * True for loopback, private, link-local, carrier-grade NAT and unspecified
 * addresses (IPv4, IPv6, and IPv4 mapped into IPv6). Anything that is not an
 * IP address counts as blocked.
 */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip.split("%")[0]);
  if (version === 4) return v4Blocked(ip);
  if (version !== 6) return true;
  const g = v6Groups(ip);
  if (g.slice(0, 7).every((x) => x === 0) && g[7] <= 1) return true; // :: and ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return v4Blocked(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`);
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  return false;
}

const LOOKUP_TTL_MS = 60_000;
const MAX_REDIRECTS = 5;

/** An add-on request refused because its host is on a private network. */
export class BlockedAddonError extends AddonError {
  constructor() {
    super("This server does not allow add-ons on private network addresses.");
  }
}

export type LookupFn = (host: string) => Promise<string[]>;

const dnsLookup: LookupFn = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

/**
 * Optionally refuses add-on requests to hosts that resolve to private network
 * addresses. Lookups are remembered briefly. Redirects are followed by hand so
 * each hop is checked.
 */
export class AddonNetworkGuard {
  blockPrivate = false;
  private readonly verdicts = new Map<string, { blocked: boolean; until: number }>();

  constructor(private readonly resolve: LookupFn = dnsLookup) {}

  /** Throws when private add-ons are blocked and the URL's host is on a private network. */
  async check(url: string): Promise<void> {
    if (!this.blockPrivate) return;
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    const now = Date.now();
    let verdict = this.verdicts.get(host);
    if (!verdict || verdict.until < now) {
      let blocked: boolean;
      try {
        const addresses = isIP(host) ? [host] : await this.resolve(host);
        blocked = addresses.length === 0 || addresses.some(isPrivateAddress);
      } catch {
        throw new AddonError("Could not reach the add-on.");
      }
      verdict = { blocked, until: now + LOOKUP_TTL_MS };
      if (this.verdicts.size > 1000) this.verdicts.clear();
      this.verdicts.set(host, verdict);
    }
    if (verdict.blocked) throw new BlockedAddonError();
  }

  /** `fetchFn` with the check applied to the URL and to every redirect. */
  wrap(fetchFn: FetchFn): FetchFn {
    return async (input, init) => {
      if (!this.blockPrivate) return fetchFn(input, init);
      let url = input;
      for (let hop = 0; ; hop++) {
        await this.check(url);
        const response = await fetchFn(url, { ...init, redirect: "manual" });
        const location = response.headers.get("location");
        if (response.status < 300 || response.status >= 400 || !location) return response;
        if (hop >= MAX_REDIRECTS) throw new AddonError("The add-on redirected too many times.");
        url = new URL(location, url).toString();
      }
    };
  }
}
