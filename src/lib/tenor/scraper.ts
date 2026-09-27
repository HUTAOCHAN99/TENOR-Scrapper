import type { Browser, Page } from "playwright";
import { TenorError } from "./types";
import { buildTenorSearchUrl } from "./utils";

const PAGE_TIMEOUT = Number(process.env.TENOR_PAGE_TIMEOUT ?? 15000);

// Guard against ever running more than one scrape at a time from this
// server instance. Requests queue behind this lock rather than spawning
// concurrent browsers, per the "no aggressive/concurrent scraping"
// requirement. This is a simple mutex, not a full job queue.
let activeScrape: Promise<unknown> = Promise.resolve();

function withScrapeLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = activeScrape.then(fn, fn);
  // Swallow errors for chaining purposes only; the real result/error is
  // still returned to the caller via `run`.
  activeScrape = run.catch(() => undefined);
  return run;
}

/**
 * Fetches the raw HTML of Tenor's public search results page for a given,
 * already-validated & normalized query, using a single headless browser
 * instance that is always closed via try/finally.
 *
 * Throws TenorError with code TENOR_UNAVAILABLE or SCRAPE_TIMEOUT. Never
 * attempts to solve CAPTCHAs or bypass any anti-bot challenge: if one is
 * detected, it aborts and throws TENOR_UNAVAILABLE.
 */
export async function fetchTenorSearchHtml(query: string): Promise<string> {
  return withScrapeLock(async () => {
    const url = buildTenorSearchUrl(query);

    let browser: Browser | undefined;
    let page: Page | undefined;

    try {
      // Imported dynamically so Playwright (a heavy, Node-only dependency)
      // is never pulled into any client bundle.
      const { chromium } = await import("playwright");

      browser = await chromium.launch({
        headless: true,
        // Optional: point at an existing Chromium-based browser (e.g. Brave)
        // instead of Playwright's bundled Chromium, if you don't want to run
        // `npx playwright install chromium`. On Windows this is typically:
        // "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
        executablePath: process.env.TENOR_BROWSER_EXECUTABLE_PATH || undefined
      });
      page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      });

      let response;
      try {
        response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: PAGE_TIMEOUT
        });
      } catch (err) {
        const isTimeout = err instanceof Error && /timeout/i.test(err.message);
        throw new TenorError(
          isTimeout ? "SCRAPE_TIMEOUT" : "TENOR_UNAVAILABLE",
          isTimeout ? "Timed out loading Tenor search page." : "Could not reach Tenor."
        );
      }

      if (!response || !response.ok()) {
        const status = response?.status();
        // Anti-bot / rate-limit style responses. We do NOT attempt to work
        // around these — we surface a clear error instead.
        if (status === 403 || status === 429 || status === 503) {
          throw new TenorError(
            "TENOR_UNAVAILABLE",
            "Tenor blocked or rate-limited this request. No bypass was attempted."
          );
        }
        throw new TenorError("TENOR_UNAVAILABLE", "Tenor could not be reached.");
      }

      // Tenor's results grid lazy-loads more items as the page is scrolled.
      // Scroll a few times within this single loaded page (no extra
      // navigations or requests to Tenor beyond the one page.goto() above)
      // so more of the grid is present in the DOM before we read it.
      try {
        for (let i = 0; i < 4; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
          await page.waitForTimeout(700);
        }
      } catch {
        // non-fatal — fall back to whatever loaded before scrolling
      }

      const html = await page.content();

      // Very lightweight CAPTCHA / block-page detection. If detected, we
      // stop immediately rather than parsing or retrying.
      const lower = html.toLowerCase();
      if (
        lower.includes("captcha") &&
        (lower.includes("verify you are human") || lower.includes("checking your browser"))
      ) {
        throw new TenorError(
          "TENOR_UNAVAILABLE",
          "Tenor presented an anti-bot challenge. No bypass was attempted."
        );
      }

      return html;
    } catch (err) {
      // Logged server-side only, for local debugging — never sent to the
      // client/API response (see route.ts, which only forwards err.code /
      // a generic message).
      console.error("[Tenor] scrape error:", err);
      if (err instanceof TenorError) throw err;
      throw new TenorError("TENOR_UNAVAILABLE", "Unexpected error while reaching Tenor.");
    } finally {
      // Always close the page/browser, even on error, so we never leak
      // browser processes.
      try {
        await page?.close();
      } catch {
        // ignore
      }
      try {
        await browser?.close();
      } catch {
        // ignore
      }
    }
  });
}
