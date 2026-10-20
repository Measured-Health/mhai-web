import path from "node:path";
import type { NextConfig } from "next";

// The repository root: npm workspaces install node_modules there.
const repositoryRoot = path.join(import.meta.dirname, "../..");

const nextConfig: NextConfig = {
  // A self-contained server for the Docker image (deploy/).
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: repositoryRoot,
    rules: {
      "*.css": {
        // Tailwind scans for class names from `base` (the working directory
        // by default). Keep scanning from the repository root, as before the
        // move to apps/clinical, so the built CSS stays the same.
        loaders: [
          {
            loader: "@tailwindcss/turbopack",
            options: { base: repositoryRoot },
          },
        ],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
