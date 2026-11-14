// A record connection's state and the rules for its form (spec §6, the
// plan's Rulings). The mock applies the same validation, so the screen and
// the sample API agree.
import {
  BASE_URL_MAX,
  SOURCE_LABEL_MAX,
  type ConnectionState,
  type ConnectorType,
  type EmrConnection,
  type EmrConnectionSummary,
} from "@/lib/api/emr-contract";

/**
 * Off and never passed a test: Not tested. Off: Switched off. On with
 * problems: Needs attention. Otherwise Connected ("No updates yet" when it
 * has read nothing).
 */
export function connectionState(c: EmrConnectionSummary): ConnectionState {
  if (!c.enabled && !c.last_test?.ok) return "not_tested";
  if (!c.enabled) return "off";
  if (c.health === "errors") return "needs_attention";
  return "connected";
}

/** On needs a passing test of the saved settings; an edit clears it. */
export const canSwitchOn = (c: EmrConnection): boolean =>
  c.last_test?.ok === true;

/** What the form holds. In edit, `credentials` are only the replaced ones. */
export type ConnectionForm = {
  source_label: string;
  base_url: string;
  settings: Record<string, string>;
  credentials: Record<string, string>;
  /** The system is on the hospital's own network (core 1.20.0, additive). */
  private_network?: boolean;
  /** Its ranges as typed, one per line or comma-separated. */
  private_cidrs?: string;
};

/** Core's limits: at most 8 private IPv4 ranges, each at most a /24. */
export const PRIVATE_RANGES_MAX = 8;
const RANGES =
  "Use up to 8 private network ranges, each at most 256 addresses, for example 10.20.30.0/24.";
const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

/** The typed ranges, split on commas, spaces and lines; empty ones dropped. */
export const privateRanges = (v: string | undefined): string[] =>
  (v ?? "").split(/[\s,]+/).filter(Boolean);

/** A private IPv4 range (10/8, 172.16/12, 192.168/16) of at most a /24. */
function privateRange(r: string): boolean {
  const m = CIDR.exec(r);
  if (!m) return false;
  const [a, b, c, d, bits] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if ([a, b, c, d].some((x) => x > 255) || bits < 24 || bits > 32) return false;
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}

const tooLong = (max: number) => `Use ${max} characters or fewer.`;
const HTTPS = "Use an address that starts with https://.";

function isHttps(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname !== "";
  } catch {
    return false;
  }
}

/**
 * The form's problems by field key (`source_label`, `base_url`, or the
 * type's own field keys); empty when it can be sent. Secrets are required
 * when adding only: in edit an empty one keeps the saved value.
 */
export function validateConnection(
  form: ConnectionForm,
  type: ConnectorType,
  mode: "add" | "edit" = "add",
): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  const label = form.source_label.trim();
  if (!label) out.source_label = "Enter the name the hospital sees.";
  else if (label.length > SOURCE_LABEL_MAX)
    out.source_label = tooLong(SOURCE_LABEL_MAX);
  const url = form.base_url.trim();
  if (!url) out.base_url = "Enter the base address.";
  else if (url.length > BASE_URL_MAX) out.base_url = tooLong(BASE_URL_MAX);
  else if (!isHttps(url)) out.base_url = HTTPS;
  for (const f of type.fields) {
    const from = f.kind === "secret" ? form.credentials : form.settings;
    const v = (Object.hasOwn(from, f.key) ? from[f.key] : "") ?? "";
    const value = f.kind === "secret" ? v : v.trim();
    const required = f.required && (f.kind === "text" || mode === "add");
    if (!value) {
      if (required) out[f.key] = `Enter ${f.label}.`;
    } else if (value.length > f.max) out[f.key] = tooLong(f.max);
  }
  if (form.private_network) {
    const ranges = privateRanges(form.private_cidrs);
    if (ranges.length === 0)
      out.private_cidrs = "Enter the network ranges the system is on.";
    else if (ranges.length > PRIVATE_RANGES_MAX || !ranges.every(privateRange))
      out.private_cidrs = RANGES;
  }
  return out;
}
