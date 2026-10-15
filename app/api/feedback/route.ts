import { FeedbackSchema } from "@/lib/feedback-link";
import { appendFeedback, createRateLimit } from "@/lib/server/feedback";

// Five sends per person per 10 minutes, and 60 an hour across the demo.
const perPerson = createRateLimit(5, 10 * 60_000);
const overall = createRateLimit(60, 60 * 60_000);

const json = (status: number, body: object) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The demo's feedback form. Each message is appended to a file on the
 * server for the team to review (deploy/README.md). It goes nowhere else,
 * and nothing is written to the server log. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid" });
  }
  const parsed = FeedbackSchema.safeParse(body);
  // A filled spam trap looks like success to the bot, and saves nothing.
  if (!parsed.success) {
    const trapped = parsed.error.issues.some((i) => i.path[0] === "website");
    return trapped ? json(200, { ok: true }) : json(400, { error: "invalid" });
  }

  // nginx sets X-Real-IP; the container is only reachable through it.
  const ip = request.headers.get("x-real-ip") ?? "unknown";
  if (!perPerson(ip) || !overall("all"))
    return json(429, { error: "rate_limited" });

  const path =
    process.env.FEEDBACK_LOG_PATH ??
    (process.env.NODE_ENV === "production"
      ? "/data/feedback/feedback.jsonl"
      : ".feedback/feedback.jsonl");
  try {
    await appendFeedback(parsed.data, path);
  } catch {
    return json(503, { error: "unavailable" });
  }
  return json(200, { ok: true });
}
