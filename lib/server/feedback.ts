import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { cleanViewport, maskPage, type FeedbackInput } from "../feedback-link";

/** Appends one JSON line per message, for the team to review on the server. */
export async function appendFeedback(
  f: FeedbackInput,
  path: string,
  now: Date = new Date(),
): Promise<void> {
  const line = JSON.stringify({
    at: now.toISOString(),
    page: maskPage(f.page),
    viewport: cleanViewport(f.viewport),
    message: f.message,
    contact: f.contact,
  });
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${line}\n`, { encoding: "utf8", mode: 0o640 });
}

/** At most `limit` sends per key in `windowMs`. Memory only, one server. */
export function createRateLimit(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear(); // never grows without bound
    return true;
  };
}
