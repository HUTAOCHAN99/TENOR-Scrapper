/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Playwright is a Node-only dependency used exclusively inside server
  // route handlers (app/api/tenor/search/route.ts). It must never be
  // imported from a Client Component.
  serverExternalPackages: ["playwright"]
};

module.exports = nextConfig;
