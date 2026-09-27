import { NextRequest, NextResponse } from "next/server";
import { isValidMediaUrl } from "@/lib/tenor/utils";

export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB safety ceiling

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: code, message }, { status });
}

/**
 * GET /api/tenor/gif?url=<encoded media url>
 *
 * This endpoint only *tests* whether a Tenor media URL that was already
 * discovered via /api/tenor/search can be fetched by the server. It is not
 * a general-purpose proxy: it refuses anything that doesn't pass
 * isValidMediaUrl (https + known Tenor media host + no private/loopback
 * addresses), enforces a timeout and a maximum size, and refuses to follow
 * a redirect to a host outside the same allowlist.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return errorResponse("INVALID_QUERY", "Query parameter 'url' is required.", 400);
  }

  if (!isValidMediaUrl(rawUrl)) {
    return errorResponse(
      "INVALID_QUERY",
      "URL must be an https Tenor media URL discovered via /api/tenor/search.",
      400
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(rawUrl, {
      method: "GET",
      redirect: "manual", // we inspect and validate redirects ourselves below
      signal: controller.signal,
      headers: { "User-Agent": "tenor-gif-scraper/1.0 (+media availability check)" }
    });

    // Handle at most one redirect hop, and only if it stays within the
    // allowed Tenor media hosts. Never follow to an arbitrary domain.
    let finalResponse = response;
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || !isValidMediaUrl(location)) {
        return errorResponse(
          "MEDIA_PARSE_FAILED",
          "Media URL redirected to a disallowed location.",
          502
        );
      }
      finalResponse = await fetch(location, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "tenor-gif-scraper/1.0 (+media availability check)" }
      });
    }

    if (!finalResponse.ok) {
      return errorResponse("TENOR_UNAVAILABLE", "Media could not be fetched.", 502);
    }

    const contentType = finalResponse.headers.get("content-type") ?? "unknown";
    const contentLength = Number(finalResponse.headers.get("content-length") ?? 0);

    if (contentLength && contentLength > MAX_BYTES) {
      return errorResponse("MEDIA_PARSE_FAILED", "Media exceeds maximum allowed size.", 413);
    }

    // We only report reachability + metadata here; we don't stream the body
    // back (the app avoids proxying media by default, per spec). The
    // frontend downloads directly from mediaUrl.
    return NextResponse.json({
      ok: true,
      contentType,
      contentLength: contentLength || null
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return errorResponse(
      isAbort ? "SCRAPE_TIMEOUT" : "TENOR_UNAVAILABLE",
      isAbort ? "Timed out fetching media." : "Could not fetch media.",
      isAbort ? 504 : 502
    );
  } finally {
    clearTimeout(timeout);
  }
}
