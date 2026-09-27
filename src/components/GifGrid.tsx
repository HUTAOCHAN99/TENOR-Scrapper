"use client";

import GifCard, { GifCardData } from "./GifCard";

export type GifGridStatus = "idle" | "loading" | "success" | "empty" | "error";

interface GifGridProps {
  status: GifGridStatus;
  results: GifCardData[];
  errorMessage?: string;
  onRetry?: () => void;
}

export default function GifGrid({ status, results, errorMessage, onRetry }: GifGridProps) {
  if (status === "idle") {
    return <p className="gif-state">Search for a GIF to get started.</p>;
  }

  if (status === "loading") {
    return <p className="gif-state">Loading GIFs…</p>;
  }

  if (status === "error") {
    return (
      <div className="gif-state">
        <p>{errorMessage ?? "Something went wrong."}</p>
        {onRetry && (
          <button onClick={onRetry} className="gif-btn">
            Retry
          </button>
        )}
      </div>
    );
  }

  if (status === "empty") {
    return <p className="gif-state">No GIFs found. Try a different keyword.</p>;
  }

  return (
    <div className="gif-grid">
      {results.map((gif) => (
        <GifCard key={gif.id} gif={gif} />
      ))}
    </div>
  );
}
