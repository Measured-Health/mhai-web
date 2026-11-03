import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The BFF's NATS client is server only (docs/adr/0005). These strings
 * appear in the transport's code and never in a page's: one in a client
 * chunk means it reached the browser.
 */
export const NATS_MARKERS = [
  "@nats-io",
  "_INBOX_bff",
  "nkeyAuthenticator",
  "Mhai-Timeout-Ms",
  "NATS_NKEY_SEED_FILE",
];

async function walk(root, rel, found) {
  const entries = await readdir(join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(root, path, found);
    else if (entry.isFile()) {
      const content = await readFile(join(root, path));
      if (NATS_MARKERS.some((m) => content.includes(m))) found.push(path);
    }
  }
}

/** Files under `<build>/static` (what the browser downloads) holding a marker. */
export async function findNatsCode(dir) {
  const found = [];
  if (existsSync(join(dir, "static"))) await walk(dir, "static", found);
  return found.sort();
}

// Usage: check-no-nats.mjs <build dir>...
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  let failed = false;
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      console.error(`No build at ${dir}. Run npm run build first.`);
      process.exit(2);
    }
    const found = await findNatsCode(dir);
    if (found.length > 0) {
      failed = true;
      console.log(`NATS code in client chunks of ${dir}:`);
      for (const file of found) console.log(`  ${file}`);
    } else console.log(`No NATS code in client chunks of ${dir}.`);
  }
  if (dirs.length === 0) {
    console.error("Usage: check-no-nats.mjs <build dir>...");
    process.exit(2);
  }
  process.exit(failed ? 1 : 0);
}
