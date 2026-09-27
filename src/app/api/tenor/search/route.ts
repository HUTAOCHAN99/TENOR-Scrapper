import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TenorError } from "@/lib/tenor/types";
import { fetchTenorSearchHtml } from "@/lib/tenor/scraper";
import { parseTenorHtml } from "@/lib/tenor/parser";
import { normalizeQuery, removeDuplicateResults } from "@/lib/tenor/utils";
import { cacheKeyForQuery, tenorSearchCache } from "@/lib/tenor/cache";
import { TenorResult } from "@/lib/tenor/types";
import { getClientIp, searchRateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs"; // Playwright requires the Node.js runtime, not Edge.

const CACHE_TTL_MS = Number(process.env.TENOR_CACHE_TTL_MS ?? 5 * 60 * 1000);

const QuerySchema = z.object({
  q: z.string().min(1).max(100)
});

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: code, message }, { status });
}

export async function GET(req: NextRequest) {
  const clientIp = getClientIp(req.headers);

  if (!searchRateLimiter.check(clientIp)) {
    console.log(`[Tenor] Rate limited: ${clientIp}`);
    return errorResponse("RATE_LIMITED", "Too many requests. Please slow down.", 429);
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined
  });

  if (!parsed.success) {
    return errorResponse("INVALID_QUERY", "A valid, non-empty query 'q' is required.", 400);
  }

  const normalizedQuery = normalizeQuery(parsed.data.q);
  if (!normalizedQuery) {
    return errorResponse("INVALID_QUERY", "A valid, non-empty query 'q' is required.", 400);
  }

  const cacheKey = cacheKeyForQuery(normalizedQuery);

  const cached = tenorSearchCache.get(cacheKey) as TenorResult[] | undefined;
  if (cached) {
    console.log(`[Tenor] Cache hit: ${normalizedQuery}`);
    return NextResponse.json({ query: normalizedQuery, results: cached });
  }

  console.log(`[Tenor] Search: ${normalizedQuery}`);

  let html: string;
  try {
    html = await fetchTenorSearchHtml(normalizedQuery);
  } catch (err) {
    if (err instanceof TenorError) {
      console.log(`[Tenor] Scrape failed: ${err.code}`);
      const status = err.code === "SCRAPE_TIMEOUT" ? 504 : 502;
      return errorResponse(err.code, err.message, status);
    }
    console.log("[Tenor] Scrape failed: unknown");
    return errorResponse("TENOR_UNAVAILABLE", "Tenor could not be reached.", 502);
  }

  let results: TenorResult[];
  try {
    results = removeDuplicateResults(parseTenorHtml(html));
  } catch {
    return errorResponse("MEDIA_PARSE_FAILED", "Could not parse Tenor's response.", 502);
  }

  if (results.length === 0) {
    console.log(`[Tenor] Results: 0`);
    return errorResponse("NO_RESULTS", "No GIFs found for this query.", 404);
  }

  console.log(`[Tenor] Results: ${results.length}`);

  tenorSearchCache.set(cacheKey, results, CACHE_TTL_MS);

  return NextResponse.json({ query: normalizedQuery, results });
}
