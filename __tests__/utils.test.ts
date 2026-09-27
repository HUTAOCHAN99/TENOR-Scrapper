import { describe, it, expect } from "vitest";
import {
  normalizeQuery,
  isValidMediaUrl,
  removeDuplicateResults,
  buildTenorSearchUrl
} from "@/lib/tenor/utils";

describe("normalizeQuery", () => {
  it("trims and lowercases valid input", () => {
    expect(normalizeQuery("  Kucing  Lucu  ")).toBe("kucing lucu");
  });

  it("rejects empty or whitespace-only input", () => {
    expect(normalizeQuery("")).toBeNull();
    expect(normalizeQuery("   ")).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(normalizeQuery(null)).toBeNull();
    expect(normalizeQuery(undefined)).toBeNull();
  });

  it("rejects overly long input", () => {
    expect(normalizeQuery("a".repeat(101))).toBeNull();
  });

  it("rejects input with control characters", () => {
    expect(normalizeQuery("hello\x00world")).toBeNull();
  });
});

describe("buildTenorSearchUrl", () => {
  it("url-encodes the query and never embeds raw special characters", () => {
    const url = buildTenorSearchUrl("cats & dogs");
    expect(url.startsWith("https://tenor.com/search/")).toBe(true);
    expect(url).not.toContain(" ");
    expect(url).not.toContain("&");
  });
});

describe("isValidMediaUrl", () => {
  it("accepts a valid https tenor media url", () => {
    expect(isValidMediaUrl("https://media.tenor.com/abc123/cat.gif")).toBe(true);
  });

  it("rejects non-https protocols", () => {
    expect(isValidMediaUrl("http://media.tenor.com/abc.gif")).toBe(false);
    expect(isValidMediaUrl("javascript:alert(1)")).toBe(false);
    expect(isValidMediaUrl("data:image/gif;base64,AAAA")).toBe(false);
  });

  it("rejects localhost and private IPs (SSRF protection)", () => {
    expect(isValidMediaUrl("https://localhost/x.gif")).toBe(false);
    expect(isValidMediaUrl("https://127.0.0.1/x.gif")).toBe(false);
    expect(isValidMediaUrl("https://192.168.1.5/x.gif")).toBe(false);
    expect(isValidMediaUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
  });

  it("rejects hosts outside the Tenor media allowlist", () => {
    expect(isValidMediaUrl("https://evil.com/x.gif")).toBe(false);
    expect(isValidMediaUrl("https://media.tenor.com.evil.com/x.gif")).toBe(false);
  });

  it("rejects malformed urls", () => {
    expect(isValidMediaUrl("not-a-url")).toBe(false);
  });
});

describe("removeDuplicateResults", () => {
  it("removes entries with duplicate mediaUrl", () => {
    const input = [
      { mediaUrl: "https://media.tenor.com/a.gif", pageUrl: "https://tenor.com/view/a" },
      { mediaUrl: "https://media.tenor.com/a.gif", pageUrl: "https://tenor.com/view/a-dup" },
      { mediaUrl: "https://media.tenor.com/b.gif", pageUrl: "https://tenor.com/view/b" }
    ];
    const out = removeDuplicateResults(input);
    expect(out).toHaveLength(2);
  });

  it("returns an empty array for empty input", () => {
    expect(removeDuplicateResults([])).toEqual([]);
  });
});
