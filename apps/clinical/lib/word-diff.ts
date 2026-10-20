export type DiffPart = { kind: "same" | "add" | "del"; text: string };

/** Above this many tokens on both sides (multiplied), show plain before/after. */
export const DIFF_TOKEN_LIMIT = 400;

// Words are runs of letters, combining marks and numbers in any script;
// each run of spaces, and every other character (punctuation, symbols,
// emoji parts), is its own token. Together they cover every code point, so
// joining the tokens always gives back the text.
const TOKEN = /[\p{L}\p{M}\p{N}]+|\s+|[^\p{L}\p{M}\p{N}\s]/gu;

export const tokenize = (s: string): string[] => s.match(TOKEN) ?? [];

function merge(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  for (const p of parts) {
    if (!p.text) continue;
    const last = out[out.length - 1];
    if (last && last.kind === p.kind) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

/** Word-level changes from `before` to `after` (longest common subsequence). */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length * b.length > DIFF_TOKEN_LIMIT ** 2)
    return merge([
      { kind: "del", text: before },
      { kind: "add", text: after },
    ]);
  const n = a.length;
  const m = b.length;
  // dp[i][j]: the longest common run of a[i..] and b[j..].
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      parts.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      parts.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      parts.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  for (; i < n; i++) parts.push({ kind: "del", text: a[i]! });
  for (; j < m; j++) parts.push({ kind: "add", text: b[j]! });
  return merge(parts);
}
