import { forbidden, json, sameOrigin } from "@/lib/server/http";
import { endSession } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  await endSession();
  return json(204);
}
