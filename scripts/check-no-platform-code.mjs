import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORM_MARKER } from "./platform-marker.mjs";

async function walk(root, rel, found) {
  const entries = await readdir(join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === "cache") continue;
      await walk(root, path, found);
    } else if (entry.isFile()) {
      const content = await readFile(join(root, path));
      if (content.includes(PLATFORM_MARKER)) found.push(path);
    }
  }
}

export async function findPlatformCode(dir) {
  const found = [];
  await walk(dir, "", found);
  return found.sort();
}

// Usage: check-no-platform-code.mjs <build dir> [--expect-found]
// By default the build must not contain the marker (the clinical app). With
// --expect-found it must (the platform app), which proves the check can see it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const expectFound = args.includes("--expect-found");
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir || !existsSync(dir)) {
    console.error(`No build at ${dir}. Run npm run build first.`);
    process.exit(2);
  }
  const found = await findPlatformCode(dir);
  if (expectFound) {
    if (found.length === 0) {
      console.error(`No platform marker in ${dir}.`);
      process.exit(1);
    }
    console.log(`Platform marker found in ${dir}:`);
    for (const file of found) console.log(`  ${file}`);
    process.exit(0);
  }
  if (found.length > 0) {
    console.log(`Platform code found in ${dir}:`);
    for (const file of found) console.log(`  ${file}`);
    process.exit(1);
  }
  console.log(`No platform code in ${dir}.`);
}
