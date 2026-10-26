import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  VIEW_IDS,
  type AnalysisQuery,
  type ViewId,
} from "@/lib/api/analysis-contract";
import { analysisCsv, figCell } from "@/lib/analysis/csv";
import { emptyQuery } from "@/lib/analysis/filters";
import type { ViewRead } from "@/lib/analysis/read";
import { alertsTotalText, viewTables } from "@/lib/analysis/tables";
import {
  csvCells,
  sampleRead,
  sampleStatus,
  type OkRead,
} from "@/tests/analysis-sample";
import { AffectedView } from "./affected-view";
import { CoOccurringView } from "./co-occurring-view";
import { FindingsView } from "./findings-view";
import { PrevalenceView } from "./prevalence-view";
import { QualityView } from "./quality-view";

// Spec §5.2: the CSV is exactly the view on screen. Every view, both
// scopes, over a few sample replies: each CSV cell is the text the screen
// shows for the same value (a number as the screen writes it, less its
// grouping and unit; every word the same).

function show(view: ViewId, read: OkRead<ViewId>) {
  const props = { onRetry() {}, mode: "table" as const, onMode() {} };
  switch (view) {
    case "prevalence":
      return render(
        <PrevalenceView state={read as ViewRead<"prevalence">} {...props} />,
      );
    case "affected":
      return render(
        <AffectedView state={read as ViewRead<"affected">} {...props} />,
      );
    case "co-occurring":
      return render(
        <CoOccurringView state={read as ViewRead<"co-occurring">} {...props} />,
      );
    case "findings":
      return render(
        <FindingsView state={read as ViewRead<"findings">} {...props} />,
      );
    case "quality":
      return render(
        <QualityView state={read as ViewRead<"quality">} {...props} />,
      );
  }
}

/** The screen's words as the CSV writes them: numbers bare, words as they are. */
const asCsv = (text: string) =>
  /^-?[\d,]+(\.\d+)?( per 1,000|%)?$/.test(text)
    ? text.replace(/ per 1,000$|%$/, "").replace(/,/g, "")
    : text;

/** The CSV rows of a titled section, up to the blank line after it. */
function section(rows: string[][], title: string): string[][] {
  const at = rows.findIndex((r) => r.length === 1 && r[0] === title);
  expect(at, `the CSV has "${title}"`).toBeGreaterThanOrEqual(0);
  const end = rows.findIndex((r, i) => i > at && r.length === 0);
  return rows.slice(at + 1, end);
}
const textOf = (el: Element) => el.textContent ?? "";

/**
 * The file's blocks after its header: each run of rows up to a blank line.
 * The header is the first block (scope, months, filters, hospitals).
 */
function blocks(rows: string[][]): string[][][] {
  const out: string[][][] = [];
  let at: string[][] = [];
  for (const r of rows.slice(1)) {
    if (r.length === 0 || (r.length === 1 && r[0] === "")) {
      if (at.length) out.push(at);
      at = [];
    } else at.push(r);
  }
  if (at.length) out.push(at);
  return out;
}
/** The header's row labels: never a figure. */
const HEADER_LABELS = new Set([
  "Scope",
  "Hospital",
  "Months",
  "Period",
  "Condition",
  "Age band",
  "Sex",
  "Setting",
  "Specialty",
  "Ward or clinic",
  "Source",
  "Hospitals",
  "Sample data",
]);

const QUERIES: AnalysisQuery[] = [
  emptyQuery("all", null),
  { ...emptyQuery("all", null), sex: "female" },
  { ...emptyQuery("all", null), condition: "d57" },
  emptyQuery("hospital", "h_havana"),
  { ...emptyQuery("hospital", "h_northgate"), age_band: "18-39" },
  emptyQuery("hospital", "h_riverside"),
];

describe("the CSV matches the screen", () => {
  it("every view, both scopes, cell by cell", async () => {
    const status = await sampleStatus();
    let checked = 0;
    for (const view of VIEW_IDS)
      for (const q of QUERIES) {
        const read = await sampleRead(view, q);
        const csv = csvCells(
          analysisCsv(view, read, { status, options: null }),
        );
        show(view, read);
        const where = `${view} ${q.scope} ${q.hospital ?? ""}`;

        // Every block in the file is the header, one of `viewTables`' tables
        // (cell for cell), or a screen section checked below; nothing else.
        const tables = viewTables(view, read.data);
        const [header, ...rest] = blocks(csv);
        for (const r of header!)
          expect(HEADER_LABELS.has(r[0]!), `${where} header ${r[0]}`).toBe(
            true,
          );
        const findings = view === "findings";
        const alerts = findings
          ? alertsTotalText((read as OkRead<"findings">).data.data)
          : null;
        const expected = [
          ...tables.map((t) => t.caption),
          ...(alerts ? [alerts] : []),
          ...(q.scope === "all" &&
          read.data.hospitals &&
          view !== "co-occurring"
            ? ["By hospital"]
            : []),
          ...(q.scope === "hospital" &&
          read.data.comparison &&
          (view === "prevalence" || findings || view === "quality")
            ? ["Compared with similar hospitals"]
            : []),
        ];
        expect(
          rest.map((b) => b[0]![0]),
          `${where}: the file's blocks`,
        ).toEqual(expected);
        tables.forEach((t, i) => {
          const [, head, ...body] = rest[i]!;
          expect(head, `${where} ${t.caption}`).toEqual(
            t.columns.map((c) => c.label),
          );
          expect(body, `${where} ${t.caption}`).toEqual(
            t.rows.map((r) =>
              t.columns.map((c) => String(figCell(r.cells[c.key] ?? ""))),
            ),
          );
        });

        // The view's tables, against the screen.
        for (const t of tables) {
          const table = screen.getByRole("table", { name: t.caption });
          const [head, ...body] = section(csv, t.caption);
          expect(head, where).toEqual(
            within(table).getAllByRole("columnheader").map(textOf),
          );
          const rows = within(table).getAllByRole("row").slice(1);
          expect(body.length, where).toBe(rows.length);
          rows.forEach((r, i) => {
            const shown = within(r).getAllByRole("cell").map(textOf).map(asCsv);
            expect(body[i], `${where} ${t.caption}`).toEqual(shown);
            checked += shown.length;
          });
        }

        // The hospital rows, in the screen's starting order.
        const hospitals = screen.queryByRole("table", { name: "By hospital" });
        if (hospitals) {
          const [head, ...body] = section(csv, "By hospital");
          expect(head.slice(0, -1)).toEqual(
            within(hospitals).getAllByRole("columnheader").map(textOf),
          );
          const rows = within(hospitals).getAllByRole("row").slice(1);
          expect(body.length, where).toBe(rows.length);
          rows.forEach((r, i) => {
            const shown = within(r).getAllByRole("cell").map(textOf).map(asCsv);
            const file = body[i]!;
            // The partly standardised sign sits in the name cell on screen.
            expect([file[0] + file.at(-1), ...file.slice(1, -1)]).toEqual(
              shown,
            );
            checked += shown.length;
          });
        } else
          expect(
            csv.some((r) => r[0] === "By hospital"),
            where,
          ).toBe(false);

        // The comparison, line by line, as the panel shows it.
        const panel = screen.queryByRole("region", {
          name: "Compared with similar hospitals",
        });
        if (panel)
          expect(
            section(csv, "Compared with similar hospitals").map((r) => r[0]),
          ).toEqual(within(panel).getAllByRole("listitem").map(textOf));
        else
          expect(
            csv.some((r) => r[0] === "Compared with similar hospitals"),
            where,
          ).toBe(false);

        if (view === "findings") {
          const line = alertsTotalText((read as OkRead<"findings">).data.data);
          expect(screen.getByText(line)).toBeInTheDocument();
          expect(csv).toContainEqual([line]);
        }
        cleanup();
      }
    expect(checked).toBeGreaterThan(1000);
  });
});
