import { TenorMediaType } from "./types";

/**
 * Domains that legitimately serve Tenor media, as observed on Tenor's own
 * public pages. We only ever trust URLs that (a) match this allowlist and
 * (b) were actually extracted from a Tenor page response — we never accept
 * an arbitrary URL supplied by the client as a "media" URL for scraping
 * purposes.
 */
const ALLOWED_MEDIA_HOSTS = [
  "media.tenor.com",
  "media1.tenor.com",
  "media2.tenor.com",
  "media3.tenor.com",
  "media4.tenor.com",
  "c.tenor.com",
  "tenor.com"
];

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  ipRange("0.0.0.0", "0.255.255.255"),
  ipRange("10.0.0.0", "10.255.255.255"),
  ipRange("100.64.0.0", "100.127.255.255"), // CGNAT
  ipRange("127.0.0.0", "127.255.255.255"), // loopback
  ipRange("169.254.0.0", "169.254.255.255"), // link-local (incl. cloud metadata)
  ipRange("172.16.0.0", "172.31.255.255"),
  ipRange("192.0.0.0", "192.0.0.255"),
  ipRange("192.168.0.0", "192.168.255.255"),
  ipRange("198.18.0.0", "198.19.255.255"),
  ipRange("224.0.0.0", "255.255.255.255") // multicast/reserved
];

function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function ipRange(start: string, end: string): [number, number] {
  return [ipToInt(start) as number, ipToInt(end) as number];
}

function isPrivateOrLoopbackIPv4(host: string): boolean {
  const value = ipToInt(host);
  if (value === null) return false;
  return PRIVATE_IPV4_RANGES.some(([start, end]) => value >= start && value <= end);
}

function isLikelyPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0") return true;
  if (h === "::1" || h.startsWith("[::1]")) return true;
  if (h.startsWith("[") ) return true; // reject raw IPv6 literals - not needed for Tenor media
  if (isPrivateOrLoopbackIPv4(h)) return true;
  return false;
}

/**
 * Normalizes a raw search keyword: trims whitespace, collapses internal
 * whitespace, lowercases for cache-key purposes, and enforces a sane
 * length/character bound. Throws nothing — returns null on invalid input so
 * callers can raise an INVALID_QUERY error with their own message.
 */
export function normalizeQuery(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return null;
  if (trimmed.length > 100) return null;
  // Disallow control characters; allow letters, numbers, spaces, and common
  // punctuation used in real search terms across languages.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * Builds the public Tenor search URL for a keyword, safely encoding the
 * user-supplied value. Never interpolates raw user input into the URL.
 */
export function buildTenorSearchUrl(query: string): string {
  return `https://tenor.com/search/${encodeURIComponent(query).replace(/%20/g, "-")}`;
}

/**
 * Validates that a candidate media/page URL is safe to use and originates
 * from a domain Tenor actually serves media/pages from. This is the single
 * gate that prevents SSRF: it rejects non-https schemes, localhost/private
 * IPs, and any host outside the Tenor media allowlist.
 */
export function isValidMediaUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (isLikelyPrivateHostname(parsed.hostname)) return false;

  const hostname = parsed.hostname.toLowerCase();
  const isAllowed = ALLOWED_MEDIA_HOSTS.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );
  if (!isAllowed) return false;

  return true;
}

/**
 * Same idea as isValidMediaUrl but for the Tenor "page" URL (the gif's
 * canonical tenor.com/view/... page), which is always on tenor.com.
 */
export function isValidTenorPageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "tenor.com" || parsed.hostname.endsWith(".tenor.com"))
    );
  } catch {
    return false;
  }
}

export function guessMediaTypeFromUrl(url: string): TenorMediaType {
  const lower = url.toLowerCase();
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  return "unknown";
}

/**
 * Removes duplicate results by mediaUrl (falling back to pageUrl), keeping
 * the first occurrence.
 */
export function removeDuplicateResults<T extends { mediaUrl: string; pageUrl: string }>(
  results: T[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of results) {
    const key = r.mediaUrl || r.pageUrl;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Simple stable id generator derived from a URL, no external deps needed. */
export function idFromUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
