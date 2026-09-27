import { describe, it, expect } from "vitest";
import { parseTenorHtml } from "@/lib/tenor/parser";

describe("parseTenorHtml", () => {
  it("extracts results from JSON-LD structured data", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {
            "@type": "ImageObject",
            "name": "Cute Cat",
            "contentUrl": "https://media.tenor.com/abc/cute-cat.gif",
            "thumbnailUrl": "https://media.tenor.com/abc/cute-cat-preview.gif",
            "url": "https://tenor.com/view/cute-cat-gif-12345",
            "width": 480,
            "height": 270
          }
        </script>
      </head><body></body></html>
    `;
    const results = parseTenorHtml(html);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Cute Cat");
    expect(results[0].mediaUrl).toBe("https://media.tenor.com/abc/cute-cat.gif");
    expect(results[0].width).toBe(480);
  });

  it("falls back to embedded JSON when JSON-LD is absent", () => {
    const html = `
      <html><body>
        <script type="application/json">
          { "results": [ { "title": "Laugh", "url": "https://tenor.com/view/laugh-1", "gif": "https://media.tenor.com/xyz/laugh.gif", "width": 320, "height": 240 } ] }
        </script>
      </body></html>
    `;
    const results = parseTenorHtml(html);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].mediaUrl).toContain("media.tenor.com");
  });

  it("falls back to DOM selectors when no structured data is present", () => {
    const html = `
      <html><body>
        <a href="/view/anime-gif-999">
          <img src="https://media.tenor.com/def/anime.gif" alt="Anime reaction" width="220" height="220" />
        </a>
      </body></html>
    `;
    const results = parseTenorHtml(html);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Anime reaction");
    expect(results[0].pageUrl).toBe("https://tenor.com/view/anime-gif-999");
  });

  it("ignores non-Tenor media urls found in the DOM", () => {
    const html = `<html><body><img src="https://evil.com/tracker.gif" /></body></html>`;
    expect(parseTenorHtml(html)).toEqual([]);
  });

  it("returns an empty array when nothing usable is found", () => {
    const html = `<html><body><p>No results</p></body></html>`;
    expect(parseTenorHtml(html)).toEqual([]);
  });

  it("does not throw on malformed JSON-LD", () => {
    const html = `<script type="application/ld+json">{ not valid json </script>`;
    expect(() => parseTenorHtml(html)).not.toThrow();
  });
});
