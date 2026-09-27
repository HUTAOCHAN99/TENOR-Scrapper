"use client";

import { useCallback, useState } from "react";
import SearchForm from "@/components/SearchForm";
import GifGrid, { GifGridStatus } from "@/components/GifGrid";
import { GifCardData } from "@/components/GifCard";

interface SearchApiSuccess {
  query: string;
  results: GifCardData[];
}

interface SearchApiError {
  error: string;
  message: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  TENOR_UNAVAILABLE: "Tenor could not be reached right now. Please try again later.",
  SCRAPE_TIMEOUT: "The search took too long. Please try again.",
  NO_RESULTS: "No GIFs found for that keyword.",
  INVALID_QUERY: "Please enter a valid search keyword.",
  MEDIA_PARSE_FAILED: "Couldn't read Tenor's results this time. Please try again.",
  RATE_LIMITED: "You're searching too quickly. Please wait a moment and try again."
};

export default function HomePage() {
  const [status, setStatus] = useState<GifGridStatus>("idle");
  const [results, setResults] = useState<GifCardData[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [lastQuery, setLastQuery] = useState<string>("");

  const runSearch = useCallback(async (query: string) => {
    setStatus("loading");
    setErrorMessage(undefined);
    setLastQuery(query);

    try {
      const res = await fetch(`/api/tenor/search?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as SearchApiSuccess | SearchApiError;

      if (!res.ok) {
        const err = data as SearchApiError;
        setStatus(err.error === "NO_RESULTS" ? "empty" : "error");
        setErrorMessage(ERROR_MESSAGES[err.error] ?? err.message ?? "Something went wrong.");
        setResults([]);
        return;
      }

      const success = data as SearchApiSuccess;
      if (success.results.length === 0) {
        setStatus("empty");
        setResults([]);
      } else {
        setStatus("success");
        setResults(success.results);
      }
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please check your connection and try again.");
    }
  }, []);

  const handleRetry = useCallback(() => {
    if (lastQuery) runSearch(lastQuery);
  }, [lastQuery, runSearch]);

  return (
    <main>
      <h1>Tenor GIF Scraper</h1>
      <SearchForm onSearch={runSearch} disabled={status === "loading"} />
      <GifGrid status={status} results={results} errorMessage={errorMessage} onRetry={handleRetry} />
    </main>
  );
}
