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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir || !existsSync(dir)) {
    console.error(`No build at ${dir}. Run npm run build first.`);
    process.exit(2);
  }
  const found = await findPlatformCode(dir);
  if (found.length > 0) {
    console.log(`Platform code found in ${dir}:`);
    for (const file of found) console.log(`  ${file}`);
    process.exit(1);
  }
  console.log(`No platform code in ${dir}.`);
}
