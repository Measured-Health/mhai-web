// The AI model's words (Plan 14). Provider names are the companies' own;
// "cloud" says the text leaves our network, "MHAI's own model" that it
// doesn't.
import {
  CLOUD_PROVIDERS,
  type CloudProvider,
} from "@/lib/api/model-policy-contract";

export const PROVIDER_LABEL: Record<CloudProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  xai: "xAI",
};
export const LOCAL_LABEL = "MHAI's own model";

const isProvider = (v: unknown): v is CloudProvider =>
  CLOUD_PROVIDERS.includes(v as CloudProvider);

/** "Anthropic (cloud)" or "MHAI's own model". */
export function policyLabel(p: CloudProvider | null): string {
  return p === null ? LOCAL_LABEL : `${PROVIDER_LABEL[p]} (cloud)`;
}

/**
 * An Activity target ("anthropic", "none") in words, or null when it isn't
 * one this app knows.
 */
export function targetLabel(t: string | null): string | null {
  if (t === "none") return LOCAL_LABEL;
  return isProvider(t) ? policyLabel(t) : null;
}

/** 1240000 → "1,240,000". */
export const tokens = (n: number) => n.toLocaleString("en-GB");

/**
 * The limit as typed: digits, with commas, spaces or underscores between
 * them. null when it isn't a whole number from 1 to `max`.
 */
export function parseBudget(text: string, max: number): number | null {
  const t = text.trim().replace(/[,\s_]/g, "");
  if (!/^[0-9]{1,10}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= max ? n : null;
}

/** "2026-11" → "November 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
