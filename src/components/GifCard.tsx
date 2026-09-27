"use client";

import { useState } from "react";

export interface GifCardData {
  id: string;
  title: string;
  pageUrl: string;
  mediaUrl: string;
  previewUrl: string;
  mediaType: "image/gif" | "video/mp4" | "video/webm" | "unknown";
  width: number;
  height: number;
}

function extensionForMediaType(mediaType: GifCardData["mediaType"]): string {
  if (mediaType === "video/mp4") return "mp4";
  if (mediaType === "video/webm") return "webm";
  return "gif";
}

export default function GifCard({ gif }: { gif: GifCardData }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(gif.mediaUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (permissions, insecure context); fail silently.
    }
  }

  async function handleDownload() {
    try {
      const res = await fetch(gif.mediaUrl);
      const contentType = res.headers.get("content-type") || "";
      let ext = extensionForMediaType(gif.mediaType);
      // Detect actual content-type rather than trusting our own guess, so we
      // never mislabel a webm/mp4 file with a .gif extension.
      if (contentType.includes("webm")) ext = "webm";
      else if (contentType.includes("mp4")) ext = "mp4";
      else if (contentType.includes("gif")) ext = "gif";

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `tenor-${gif.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(gif.mediaUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="gif-card">
      {gif.mediaType === "video/mp4" || gif.mediaType === "video/webm" ? (
        <video src={gif.previewUrl} muted loop autoPlay playsInline className="gif-media" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={gif.previewUrl} alt={gif.title} className="gif-media" loading="lazy" />
      )}
      <div className="gif-card-body">
        <p className="gif-title" title={gif.title}>
          {gif.title}
        </p>
        <div className="gif-actions">
          <button onClick={handleCopy} className="gif-btn">
            {copied ? "Copied!" : "Copy URL"}
          </button>
          <a href={gif.pageUrl} target="_blank" rel="noopener noreferrer" className="gif-btn">
            Open Tenor
          </a>
          <button onClick={handleDownload} className="gif-btn">
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
