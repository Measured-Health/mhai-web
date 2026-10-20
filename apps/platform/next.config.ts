import path from "node:path";
import type { NextConfig } from "next";

// The repository root: npm workspaces install node_modules there.
const repositoryRoot = path.join(import.meta.dirname, "../..");

// No cacheComponents and no partialPrefetching: the nonce-based CSP in
// proxy.ts needs every page rendered per request (a static shell can't carry
// the request's nonce).
const nextConfig: NextConfig = {
  // A self-contained server for the Docker image (deploy/).
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  // Shared workspace packages ship TypeScript source.
  transpilePackages: ["@mhai/api-client", "@mhai/ui"],
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
