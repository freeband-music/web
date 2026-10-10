import { badRequest } from "../http";

/**
 * Accepts a base URL or a full manifest URL and returns the add-on URL
 * (no trailing slash, no `/manifest.json`). It may end in a config segment.
 */
export function normalizeAddonUrl(input: string): string {
  let text = input.trim();
  if (!text) throw badRequest("Enter an add-on URL.", "invalid_addon_url");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw badRequest("That is not a valid URL.", "invalid_addon_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw badRequest("Add-on URLs must start with http:// or https://.", "invalid_addon_url");
  }
  if (url.search || url.hash) throw badRequest("Add-on URLs cannot have a query or fragment.", "invalid_addon_url");
  const path = url.pathname.replace(/\/manifest\.json$/, "").replace(/\/+$/, "");
  const auth = url.username || url.password ? `${url.username}${url.password ? `:${url.password}` : ""}@` : "";
  return `${url.protocol}//${auth}${url.host}${path}`;
}

/** True when a path segment looks like a protocol config segment (base64url JSON) or an opaque token. */
export function looksLikeConfig(segment: string): boolean {
  let text: string;
  try {
    text = decodeURIComponent(segment);
  } catch {
    return true;
  }
  if (/^[A-Za-z0-9_-]+=*$/.test(text)) {
    try {
      const value: unknown = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
      if (value !== null && typeof value === "object") return true;
    } catch {
      // Not JSON; fall through to the length check.
    }
    return text.length >= 32;
  }
  return false;
}

/**
 * Splits an add-on URL into the part that is safe to show and whether it
 * carries configuration. Credentials in the URL's user-info part also count
 * as configuration.
 */
export function splitAddonUrl(addonUrl: string): { baseUrl: string; hasConfig: boolean } {
  const url = new URL(addonUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  const last = segments.at(-1);
  const configSegment = last !== undefined && looksLikeConfig(last);
  const path = (configSegment ? segments.slice(0, -1) : segments).map((s) => `/${s}`).join("");
  return {
    baseUrl: `${url.protocol}//${url.host}${path}`,
    hasConfig: configSegment || Boolean(url.username || url.password),
  };
}
