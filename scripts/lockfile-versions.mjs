// Prints the sorted, unique name@version list of every package in a
// package-lock.json, leaving out the workspace folders and their links.
// Usage: node scripts/lockfile-versions.mjs <package-lock.json>
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error(
    "usage: node scripts/lockfile-versions.mjs <package-lock.json>",
  );
  process.exit(2);
}

const { packages = {} } = JSON.parse(readFileSync(file, "utf8"));
const workspaceFolder = /^(apps|packages)\/[^/]+$/;
const entries = new Set();

for (const [key, entry] of Object.entries(packages)) {
  if (key === "" || workspaceFolder.test(key)) continue;
  if (entry.link || !entry.version) continue;
  const name = entry.name ?? key.slice(key.lastIndexOf("node_modules/") + 13);
  entries.add(`${name}@${entry.version}`);
}

for (const line of [...entries].sort()) console.log(line);
