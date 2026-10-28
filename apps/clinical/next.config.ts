import path from "node:path";
import type { NextConfig } from "next";

// The repository root: npm workspaces install node_modules there.
const repositoryRoot = path.join(import.meta.dirname, "../..");

// No cacheComponents and no partialPrefetching: the nonce-based CSP in
// proxy.ts needs every page rendered per request (a static shell can't carry
// the request's nonce).
const fullLoad = [
  { type: "header" as const, key: "rsc" },
  { type: "header" as const, key: "next-router-prefetch" },
];

const ENDED_REWRITES = ["/c/:id", "/print/:id"].map((source) => ({
  source,
  missing: fullLoad,
  destination: "/ended",
}));

const nextConfig: NextConfig = {
  // A self-contained server for the Docker image (deploy/).
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  // Shared workspace packages ship TypeScript source.
  transpilePackages: ["@mhai/api-client", "@mhai/tokens", "@mhai/ui"],
  // A full page load of a consultation or its printout starts a new, empty
  // in-memory session, so the consultation can't be there: send those loads
  // to a 404 page. In-app navigation (RSC requests and prefetches) skips this
  // and keeps working, because the session is still in memory. A config
  // rewrite, not proxy.ts: Next strips the RSC headers from the request a
  // proxy sees, so only here can `missing` tell the two apart. proxy.ts still
  // runs first and sets the security headers on both.
  // Revisit when consultations can be fetched again after a reload (Plan 2).
  async rewrites() {
    return { beforeFiles: ENDED_REWRITES, afterFiles: [], fallback: [] };
  },
  turbopack: {
    root: repositoryRoot,
    rules: {
      "*.css": {
        // Tailwind scans for class names from `base`: this app's folder.
        // The shared packages are added with `@source` in app/globals.css.
        loaders: [
          {
            loader: "@tailwindcss/turbopack",
            options: { base: import.meta.dirname },
          },
        ],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
