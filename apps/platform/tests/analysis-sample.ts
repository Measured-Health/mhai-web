import type {
  AGuarded,
  AnalysisQuery,
  ViewId,
} from "@/lib/api/analysis-contract";
import { createMockPlatform } from "@/lib/api/mock";
import { emptyQuery } from "@/lib/analysis/filters";
import { readStatus, readView, type ViewRead } from "@/lib/analysis/read";
import { ADA } from "./render";

export type OkRead<V extends ViewId> = Extract<ViewRead<V>, { status: "ok" }>;

export const ALL: AnalysisQuery = emptyQuery("all", null);
export const HAVANA: AnalysisQuery = emptyQuery("hospital", "h_havana");

/** One view of the sample, read as the page reads it. */
export async function sampleRead<V extends ViewId>(
  view: V,
  q: AnalysisQuery = ALL,
): Promise<OkRead<V>> {
  const api = createMockPlatform({ delayMs: 0, me: () => ADA.email });
  const raw = await api.getAnalysisView(view, q);
  const read = readView(view, raw, q);
  if (read.status !== "ok") throw new Error(`the sample ${view} should read`);
  return read as OkRead<V>;
}

export const HIDDEN: AGuarded = { value: null, suppressed: true };
export const shown = (value: number): AGuarded => ({
  value,
  suppressed: false,
});

/** The sample's status, read. */
export async function sampleStatus() {
  const api = createMockPlatform({ delayMs: 0, me: () => ADA.email });
  const s = readStatus(await api.getAnalysisStatus());
  if (s.status !== "ok") throw new Error("the sample status should read");
  return s.data;
}

/** A CSV's cells, row by row (RFC 4180: a quoted cell may hold a comma). */
export function csvCells(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = csv.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += ch;
  }
  return rows.map((r) => (r.length === 1 && r[0] === "" ? [] : r));
}
