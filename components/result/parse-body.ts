import type { Citation } from "@/lib/api/contract";

export interface ParsedBody {
  summary: string;
  steps: { text: string; citation?: Citation }[];
}

/**
 * Body format: non-bullet lines form the summary; lines starting with "- "
 * are next steps. A trailing "[n]" links a step to citations[n-1]; markers
 * outside the list are dropped rather than guessed.
 */
export function parseBody(text: string, citations: Citation[]): ParsedBody {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const summary = lines.filter((l) => !l.startsWith("- ")).join(" ");
  const steps = lines
    .filter((l) => l.startsWith("- "))
    .map((l) => {
      const m = l.slice(2).match(/^(.*?)\s*\[(\d+)\]\s*$/);
      const t = m ? m[1] : l.slice(2);
      const n = m ? Number(m[2]) : 0;
      const c = n >= 1 ? citations[n - 1] : undefined;
      return c ? { text: t, citation: c } : { text: t };
    });
  return { summary, steps };
}
