import * as cheerio from "cheerio";
import { TenorResult } from "./types";
import { guessMediaTypeFromUrl, idFromUrl, isValidMediaUrl, isValidTenorPageUrl } from "./utils";

/**
 * Parsing strategy contract. Each strategy tries to extract results from
 * the raw HTML and returns [] if it finds nothing usable (never throws for
 * "not found" — only genuine parse errors should throw). Strategies are
 * tried in order in parseTenorHtml() until one yields results, so that a
 * change to Tenor's markup only requires adding/adjusting a strategy
 * rather than rewriting the whole parser.
 */
type ExtractionStrategy = (html: string) => TenorResult[];

function toResult(partial: {
  title?: string;
  pageUrl?: string;
  mediaUrl?: string;
  previewUrl?: string;
  width?: number;
  height?: number;
}): TenorResult | null {
  const { title, pageUrl, mediaUrl, previewUrl, width, height } = partial;
  if (!mediaUrl || !isValidMediaUrl(mediaUrl)) return null;
  if (pageUrl && !isValidTenorPageUrl(pageUrl)) return null;

  const finalPreview = previewUrl && isValidMediaUrl(previewUrl) ? previewUrl : mediaUrl;

  return {
    id: idFromUrl(mediaUrl),
    title: (title || "Tenor GIF").trim().slice(0, 200),
    pageUrl: pageUrl || mediaUrl,
    mediaUrl,
    previewUrl: finalPreview,
    mediaType: guessMediaTypeFromUrl(mediaUrl),
    width: width && width > 0 ? width : 0,
    height: height && height > 0 ? height : 0,
    source: "tenor"
  };
}

/**
 * Strategy 1: structured data (JSON-LD) blocks, when Tenor includes them.
 * JSON-LD is the most stable extraction surface because it's a documented
 * SEO contract rather than incidental markup.
 */
const extractFromJsonLd: ExtractionStrategy = (html) => {
  const $ = cheerio.load(html);
  const results: TenorResult[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        walkJsonLdNode(item, results);
      }
    } catch {
      // malformed JSON-LD block — skip it, try the next script tag
    }
  });

  return results;
};

function walkJsonLdNode(node: unknown, out: TenorResult[]): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  const type = obj["@type"];
  const isImageOrVideoObject =
    type === "ImageObject" || type === "VideoObject" || type === "ImageGallery";

  if (isImageOrVideoObject) {
    const contentUrl = typeof obj.contentUrl === "string" ? obj.contentUrl : undefined;
    const thumbnailUrl =
      typeof obj.thumbnailUrl === "string"
        ? obj.thumbnailUrl
        : typeof (obj.thumbnail as Record<string, unknown> | undefined)?.url === "string"
        ? ((obj.thumbnail as Record<string, unknown>).url as string)
        : undefined;
    const url = typeof obj.url === "string" ? obj.url : undefined;
    const name = typeof obj.name === "string" ? obj.name : undefined;
    const width = typeof obj.width === "number" ? obj.width : undefined;
    const height = typeof obj.height === "number" ? obj.height : undefined;

    const built = toResult({
      title: name,
      pageUrl: url,
      mediaUrl: contentUrl,
      previewUrl: thumbnailUrl,
      width,
      height
    });
    if (built) out.push(built);
  }

  // Recurse into nested arrays/objects (e.g. itemListElement, associatedMedia)
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      value.forEach((v) => walkJsonLdNode(v, out));
    } else if (value && typeof value === "object") {
      walkJsonLdNode(value, out);
    }
  }
}

/**
 * Strategy 2: JSON blobs embedded in the page for client-side hydration
 * (e.g. a Next.js/Redux-style __NEXT_DATA__ or similar inline <script>
 * payload). We scan all inline scripts for JSON and recursively look for
 * objects that look like GIF entries (a url-ish field plus width/height).
 */
const extractFromEmbeddedJson: ExtractionStrategy = (html) => {
  const $ = cheerio.load(html);
  const results: TenorResult[] = [];

  $("script").each((_, el) => {
    const type = $(el).attr("type");
    if (type && type !== "application/json" && type !== "text/javascript" && type !== "") return;
    const raw = $(el).contents().text();
    if (!raw || raw.length < 20) return;

    // Only attempt JSON.parse on scripts that look like pure JSON payloads
    // (starts with { or [) to avoid running expensive parsing/regex against
    // arbitrary executable JS.
    const trimmed = raw.trim();
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return;

    try {
      const data = JSON.parse(trimmed);
      findGifLikeObjects(data, results, 0);
    } catch {
      // not valid standalone JSON — skip
    }
  });

  return results;
};

function findGifLikeObjects(node: unknown, out: TenorResult[], depth: number): void {
  if (depth > 8 || !node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) findGifLikeObjects(item, out, depth + 1);
    return;
  }

  const obj = node as Record<string, unknown>;
  const candidateUrlKeys = ["gif", "mp4", "webm", "url", "src"];
  let mediaUrl: string | undefined;

  for (const key of candidateUrlKeys) {
    const val = obj[key];
    if (typeof val === "string" && /\.(gif|mp4|webm)(\?|$)/i.test(val)) {
      mediaUrl = val;
      break;
    }
    if (val && typeof val === "object" && typeof (val as Record<string, unknown>).url === "string") {
      const nested = (val as Record<string, unknown>).url as string;
      if (/\.(gif|mp4|webm)(\?|$)/i.test(nested)) {
        mediaUrl = nested;
        break;
      }
    }
  }

  if (mediaUrl) {
    const built = toResult({
      title: typeof obj.title === "string" ? obj.title : undefined,
      pageUrl: typeof obj.itemurl === "string" ? obj.itemurl : typeof obj.url === "string" ? obj.url : undefined,
      mediaUrl,
      width: typeof obj.width === "number" ? obj.width : undefined,
      height: typeof obj.height === "number" ? obj.height : undefined
    });
    if (built) out.push(built);
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") findGifLikeObjects(value, out, depth + 1);
  }
}

/**
 * Strategy 3: HTML <meta> tags (Open Graph / Twitter Card), useful mainly
 * for single-result / detail-style pages but harmless to run on search
 * pages too.
 */
const extractFromMetaTags: ExtractionStrategy = (html) => {
  const $ = cheerio.load(html);
  const mediaUrl =
    $('meta[property="og:video"]').attr("content") ||
    $('meta[property="og:image"]').attr("content");
  const pageUrl = $('meta[property="og:url"]').attr("content");
  const title = $('meta[property="og:title"]').attr("content");

  const built = toResult({ title, pageUrl, mediaUrl });
  return built ? [built] : [];
};

/**
 * Strategy 4: DOM selector fallback. This is the most brittle strategy and
 * is intentionally last. It looks for <img>/<video>/<source> elements whose
 * src/srcset points at a Tenor media host, paired with the nearest
 * ancestor <a> for the page URL.
 */
const extractFromDomSelectors: ExtractionStrategy = (html) => {
  const $ = cheerio.load(html);
  const results: TenorResult[] = [];

  $("img, video, source").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src") || $el.attr("data-src") || $el.attr("srcset")?.split(" ")[0];
    if (!src || !isValidMediaUrl(src)) return;

    const $link = $el.closest("a");
    const href = $link.attr("href");
    const pageUrl = href
      ? href.startsWith("http")
        ? href
        : `https://tenor.com${href.startsWith("/") ? "" : "/"}${href}`
      : undefined;

    const title = $el.attr("alt") || $link.attr("aria-label") || undefined;
    const width = Number($el.attr("width")) || undefined;
    const height = Number($el.attr("height")) || undefined;

    const built = toResult({ title, pageUrl, mediaUrl: src, width, height });
    if (built) results.push(built);
  });

  return results;
};

const STRATEGIES: ExtractionStrategy[] = [
  extractFromJsonLd,
  extractFromEmbeddedJson,
  extractFromMetaTags,
  extractFromDomSelectors
];

/**
 * Runs every extraction strategy and merges their results, rather than
 * stopping at the first non-empty one. This matters in practice: a
 * strategy like JSON-LD often only exposes one or two page-level items
 * (e.g. share metadata), not the full results grid, so relying on it alone
 * would silently truncate a 20-result search down to 1-2 results. Later
 * strategies still run even if an earlier one found something.
 *
 * Order still matters for de-duplication: removeDuplicateResults() (called
 * by the API route) keeps the first occurrence of a given mediaUrl, so
 * results from earlier (more structured/reliable) strategies win when the
 * same GIF is found by more than one strategy.
 */
export function parseTenorHtml(html: string): TenorResult[] {
  const merged: TenorResult[] = [];
  for (const strategy of STRATEGIES) {
    try {
      merged.push(...strategy(html));
    } catch {
      // one strategy failing shouldn't block the others
    }
  }
  return merged;
}
