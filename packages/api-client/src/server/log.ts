import "server-only";

/**
 * The BFF's server log for the backend transport: one JSON line per event,
 * with a fixed event text and only these fields. Never a token, seed,
 * password, body, path or query string: nothing else can be passed.
 */
export type LogFields = {
  app?: string;
  method?: string;
  status?: number;
  duration_ms?: number;
  request_id?: string;
  /** An error's class name only. */
  error?: string;
};

export type LogLine = (line: string) => void;

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const NAME = /^[A-Za-z0-9_]{1,64}$/;

/** Keeps only well-formed values: an id or class name that isn't one is dropped. */
export function formatLog(event: string, fields: LogFields = {}): string {
  const out: Record<string, string | number> = { msg: event };
  if (fields.app === "clinical" || fields.app === "platform")
    out.app = fields.app;
  if (fields.method && /^[A-Z]{3,7}$/.test(fields.method))
    out.method = fields.method;
  if (Number.isInteger(fields.status)) out.status = fields.status!;
  if (Number.isFinite(fields.duration_ms))
    out.duration_ms = Math.round(fields.duration_ms!);
  if (fields.request_id && REQUEST_ID.test(fields.request_id))
    out.request_id = fields.request_id;
  if (fields.error && NAME.test(fields.error)) out.error = fields.error;
  return JSON.stringify(out);
}

export const defaultLog: LogLine = (line) => {
  console.info(line);
};
