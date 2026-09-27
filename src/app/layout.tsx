import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tenor GIF Scraper",
  description: "Search GIFs from Tenor's public search pages (no API key required)."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
