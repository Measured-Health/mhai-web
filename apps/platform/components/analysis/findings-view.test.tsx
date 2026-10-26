import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  HAVANA,
  HIDDEN,
  sampleRead,
  shown,
  type OkRead,
} from "@/tests/analysis-sample";
import { FindingsView } from "./findings-view";

function show(read: OkRead<"findings">, mode: "chart" | "table" = "chart") {
  return render(
    <FindingsView
      state={read}
      onRetry={() => {}}
      mode={mode}
      onMode={() => {}}
    />,
  );
}
const list = (name: string) =>
  within(screen.getByRole("list", { name })).getAllByRole("listitem");

describe("Findings and alerts", () => {
  it("findings link to Usage for alert handling and show no acknowledgement times", async () => {
    const read = await sampleRead("findings");
    const { container } = show(read);
    const link = screen.getByRole("link", {
      name: "See alert handling on Usage",
    });
    expect(link).toHaveAttribute("href", "/usage");
    expect(container.textContent).not.toMatch(/acknowledg|minutes|\bmin\b/i);
    // Alerts by severity, in words and icons, in a fixed order.
    const sev = list("Alerts by severity");
    expect(
      sev.map((li) => li.querySelector("span > span")!.textContent),
    ).toEqual(["Critical", "Urgent", "Info"]);
    for (const li of sev) {
      expect(li.querySelector("svg")).not.toBeNull();
      expect(li.querySelector("b")!.textContent).toMatch(
        /^(?:[\d,]+|Fewer than 5|Too few hospitals to show)$/,
      );
    }
    // Across hospitals: the hospital rows, no comparison.
    expect(screen.getByRole("table", { name: "By hospital" })).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Compared with similar hospitals" }),
    ).toBeNull();
  });

  it("findings by patients, with the flag word and icon, and Not standardised for no name", async () => {
    const read = await sampleRead("findings");
    const f = read.data.data.findings;
    f[0] = { ...f[0]!, name: null, flag: "high" };
    show(read);
    const items = list("Findings");
    expect(items.length).toBe(f.length);
    expect(items[0]!.textContent).toContain("Not standardised · High");
    for (const li of items) {
      expect(li.querySelector("svg")).not.toBeNull();
      expect(li.querySelector("span > span")!.textContent).toMatch(
        / · (High|Low|Abnormal|No flag)$/,
      );
    }
  });

  it("a hidden rate beside a shown count reads Not shown", async () => {
    const read = await sampleRead("findings");
    const f = read.data.data.findings;
    f[0] = {
      ...f[0]!,
      patients: { ...shown(25), drill: null },
      rate: { count: shown(25), base: HIDDEN, per_1000: HIDDEN },
    };
    f[0] = { ...f[0]!, name: "Zzz moved by its size" };
    show(read);
    const first = list("Findings").find((li) =>
      li.textContent!.startsWith("Zzz moved by its size"),
    )!;
    expect(first.querySelector("b")!.textContent).toBe("25");
    expect(first.textContent).toContain("Not shown");
    expect(first.textContent).not.toMatch(/Fewer than 5/);
  });

  it("hidden findings come last, by name, whatever the server's order", async () => {
    const read = await sampleRead("findings");
    const f = read.data.data.findings;
    expect(f.length).toBeGreaterThan(2);
    f[0] = {
      ...f[0]!,
      name: "Aaa first by name",
      patients: { ...HIDDEN, drill: null },
      rate: { count: HIDDEN, base: f[0]!.rate.base, per_1000: HIDDEN },
    };
    show(read);
    const items = list("Findings");
    expect(items.at(-1)!.textContent).toContain("Aaa first by name");
    expect(items.at(-1)!.querySelector("b")!.textContent).toBe("Fewer than 5");
  });

  it("One hospital: the comparison on abnormal findings per 1,000", async () => {
    const read = await sampleRead("findings", HAVANA);
    show(read);
    const panel = screen.getByRole("region", {
      name: "Compared with similar hospitals",
    });
    expect(panel.textContent).toMatch(/per 1,000/);
    expect(screen.queryByRole("table", { name: "By hospital" })).toBeNull();
  });

  it("each view has a Table with the same numbers (Findings)", async () => {
    const read = await sampleRead("findings");
    const { unmount } = show(read);
    const findings = list("Findings").map((li) => ({
      text: li.querySelector("b")!.textContent!,
      note: li.querySelector("span.block")?.textContent ?? null,
    }));
    const sev = list("Alerts by severity").map(
      (li) => li.querySelector("b")!.textContent!,
    );
    unmount();
    show(read, "table");
    const ft = screen.getByRole("table", { name: "Findings" });
    expect(
      within(ft)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Finding", "Flag", "Patients", "Per 1,000 seen"]);
    const rows = within(ft).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(findings.length);
    rows.forEach((r, i) => {
      const [, , patients, rate] = within(r)
        .getAllByRole("cell")
        .map((c) => c.textContent!);
      expect(patients).toBe(findings[i]!.text);
      if (findings[i]!.note !== null) expect(findings[i]!.note).toBe(rate);
    });
    const at = screen.getByRole("table", { name: "Alerts by severity" });
    expect(
      within(at)
        .getAllByRole("row")
        .slice(1)
        .map((r) => within(r).getAllByRole("cell")[1]!.textContent),
    ).toEqual(sev);
  });
});
