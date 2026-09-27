# Tenor GIF Scraper

Searches GIFs from Tenor's **public search pages** — no Tenor API, no API key.
Built with Next.js (App Router) + TypeScript.

> This project intentionally does **not** attempt to bypass CAPTCHAs, Cloudflare,
> authentication, rate limits, or any other anti-bot system. If Tenor blocks or
> challenges a request, the app stops and returns a clear error instead of
> working around the protection.

## Install & run

```bash
npm install
npx playwright install chromium
npm run dev
```

Then open http://localhost:3000.

## Build

```bash
npm run build
```

Builds cleanly with no TypeScript errors.

## Tests

```bash
npm run test
```

22 unit tests covering query normalization, media URL / SSRF validation,
duplicate removal, HTML parsing (all four extraction strategies), and cache
TTL behavior.

## Example request

```
GET /api/tenor/search?q=kucing&limit=20
```

## Example response

```json
{
  "query": "kucing",
  "results": [
    {
      "id": "1a2b3c",
      "title": "Cute Cat",
      "pageUrl": "https://tenor.com/view/cute-cat-gif-12345",
      "mediaUrl": "https://media.tenor.com/abc/cute-cat.gif",
      "previewUrl": "https://media.tenor.com/abc/cute-cat-preview.gif",
      "mediaType": "image/gif",
      "width": 480,
      "height": 270,
      "source": "tenor"
    }
  ]
}
```

Error shape:

```json
{ "error": "TENOR_UNAVAILABLE", "message": "Tenor could not be reached." }
```

Error codes: `TENOR_UNAVAILABLE`, `SCRAPE_TIMEOUT`, `NO_RESULTS`,
`INVALID_QUERY`, `MEDIA_PARSE_FAILED`, `RATE_LIMITED`. No stack traces,
internal paths, Playwright error detail, or env vars are ever exposed.

## Optional endpoint

```
GET /api/tenor/gif?url=<encoded Tenor media URL>
```

Checks whether a media URL discovered via `/api/tenor/search` is reachable,
and returns its `content-type` / `content-length`. It does **not** proxy the
media by default — the frontend downloads directly from `mediaUrl`. It only
accepts URLs that pass `isValidMediaUrl()` (https + Tenor media host +
not private/loopback), enforces a 10s timeout and a 15MB size ceiling, and
will not follow a redirect outside the allowed hosts.

## How the parser finds media URLs

`src/lib/tenor/parser.ts` runs a series of independent extraction
**strategies**, in order, and uses the first one that returns results. This
makes the app resilient to Tenor changing its markup — you only need to add
or tweak one strategy, not rewrite the whole scraper:

1. **JSON-LD structured data** (`<script type="application/ld+json">`) —
   the most stable surface, since it's a documented SEO contract rather than
   incidental markup.
2. **Embedded JSON payloads** — inline `<script>` blocks that look like pure
   JSON and contain GIF-shaped objects (a `gif`/`mp4`/`webm`/`url` field plus
   width/height).
3. **Open Graph / Twitter Card meta tags** — `og:video`, `og:image`,
   `og:url`, `og:title`.
4. **DOM selector fallback** — `<img>`/`<video>`/`<source>` elements whose
   `src` points at a known Tenor media host, paired with the nearest `<a>`
   ancestor for the page URL.

Every candidate result — regardless of which strategy found it — is passed
through `isValidMediaUrl()` / `isValidTenorPageUrl()` before being accepted,
so no strategy can smuggle through a URL from an untrusted host.

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # Client Component: search UI + fetch to the API route
│   └── api/tenor/
│       ├── search/route.ts       # Server route: validate → cache → scrape → parse → respond
│       └── gif/route.ts          # Optional: test whether a discovered media URL is reachable
├── lib/
│   ├── tenor/
│   │   ├── scraper.ts            # Playwright, server-only, one browser per request, try/finally
│   │   ├── parser.ts             # Modular multi-strategy HTML parsing
│   │   ├── types.ts              # TenorResult, TenorError
│   │   ├── cache.ts              # In-memory TTL cache (swappable for Redis/Upstash)
│   │   └── utils.ts              # normalizeQuery, isValidMediaUrl (SSRF guard), dedupe, etc.
│   └── rateLimit.ts              # In-memory fixed-window limiter (swappable for Redis/Upstash)
└── components/
    ├── SearchForm.tsx
    ├── GifGrid.tsx
    └── GifCard.tsx
```

All Playwright usage is confined to `scraper.ts`, which is only ever
imported from the Node.js-runtime API route — never from a Client Component.

## Safety notes

- Only one scrape runs at a time per server instance (a lock queues
  concurrent requests rather than launching multiple browsers).
- Search results are cached for 5 minutes per normalized query
  (`tenor:<query>`) so repeated searches/refreshes don't re-hit Tenor.
- `/api/tenor/search` is rate-limited to 10 requests/minute per IP by
  default (`429` on excess) — see `.env.example` to tune.
- All outbound media/page URLs are validated against an allowlist of known
  Tenor hosts, must be `https:`, and are checked against private/loopback IP
  ranges before ever being used — this is the SSRF protection.
- If Tenor returns a 403/429/503, or the page contains a CAPTCHA/anti-bot
  challenge, the app stops immediately and returns `TENOR_UNAVAILABLE`. No
  bypass is attempted anywhere in this codebase.
