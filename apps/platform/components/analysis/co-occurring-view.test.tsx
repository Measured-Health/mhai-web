import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  HIDDEN,
  sampleRead,
  shown,
  type OkRead,
} from "@/tests/analysis-sample";
import { CoOccurringView } from "./co-occurring-view";

function show(read: OkRead<"co-occurring">, mode: "chart" | "table" = "chart") {
  return render(
    <CoOccurringView
      state={read}
      onRetry={() => {}}
      mode={mode}
      onMode={() => {}}
    />,
  );
}
const items = () =>
  within(
    screen.getByRole("list", { name: "Pairs of conditions" }),
  ).getAllByRole("listitem");

describe("Co-occurring conditions", () => {
  it("lists up to 20 pairs as A + B, with the share of people with the first as the note", async () => {
    const read = await sampleRead("co-occurring");
    show(read);
    const pairs = items();
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.length).toBeLessThanOrEqual(20);
    const p = read.data.data.pairs[0]!;
    const a = p.a.name ?? "Not standardised";
    const b = p.b.name ?? "Not standardised";
    expect(pairs[0]!.textContent).toContain(`${a} + ${b}`);
    expect(pairs[0]!.textContent).toMatch(
      new RegExp(`(\\d+% of people with ${a}|Share of people with ${a}: )`),
    );
    expect(
      screen.getByText("Pairs are counted within each hospital, then added up"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Compared with similar hospitals" }),
    ).toBeNull();
  });

  it("co-occurring: the rare pair reads Fewer than 5, after the shown pairs", async () => {
    const read = await sampleRead("co-occurring");
    const pairs = read.data.data.pairs;
    expect(pairs.length).toBeGreaterThan(2);
    // The rare pair arrives first: it still goes last, and says nothing.
    const rare = {
      ...pairs[1]!,
      patients: { ...HIDDEN, drill: null },
      share_of_a: HIDDEN,
    };
    pairs.splice(1, 1);
    pairs.unshift(rare);
    show(read);
    const list = items();
    const label = `${rare.a.name ?? "Not standardised"} + ${rare.b.name ?? "Not standardised"}`;
    const at = list.findIndex((li) => li.textContent!.startsWith(label));
    const item = list[at]!;
    expect(item.querySelector("b")!.textContent).toBe("Fewer than 5");
    expect(item.textContent).not.toMatch(/of people with/);
    expect(item.querySelector("[aria-hidden].rounded-full")).toBeNull();
    // Every shown pair comes before it; only hidden ones after.
    list.forEach((li, i) => {
      const shownPair = /^[\d,]+$/.test(li.querySelector("b")!.textContent!);
      if (shownPair) expect(i).toBeLessThan(at);
    });
    expect(
      list
        .slice(at)
        .every((li) => !/^[\d,]+$/.test(li.querySelector("b")!.textContent!)),
    ).toBe(true);
  });

  it("a hidden share beside a shown pair reads Not shown", async () => {
    const read = await sampleRead("co-occurring");
    const pairs = read.data.data.pairs;
    pairs[0] = {
      ...pairs[0]!,
      patients: { ...shown(25), drill: null },
      share_of_a: HIDDEN,
    };
    const label = `${pairs[0]!.a.name ?? "Not standardised"} + ${pairs[0]!.b.name ?? "Not standardised"}`;
    show(read);
    const item = items().find((li) => li.textContent!.startsWith(label))!;
    expect(item.querySelector("b")!.textContent).toBe("25");
    expect(item.textContent).toContain(
      `Share of people with ${pairs[0]!.a.name ?? "Not standardised"}: Not shown`,
    );
  });

  it("each view has a Table with the same numbers (Co-occurring)", async () => {
    const read = await sampleRead("co-occurring");
    const { unmount } = show(read);
    const bars = items().map((li) => ({
      label: li.querySelector("span > span")!.textContent!,
      text: li.querySelector("b")!.textContent!,
      note: li.querySelector("span.block")?.textContent ?? null,
    }));
    unmount();
    show(read, "table");
    const table = screen.getByRole("table", { name: "Pairs of conditions" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Pair", "Patients", "Share of people with the first"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(bars.length);
    rows.forEach((r, i) => {
      const [pair, patients, share] = within(r)
        .getAllByRole("cell")
        .map((c) => c.textContent!);
      expect(pair).toBe(bars[i]!.label);
      expect(patients).toBe(bars[i]!.text);
      // The note carries the same share, in the same words.
      if (bars[i]!.note !== null) expect(bars[i]!.note).toContain(share);
    });
    expect(
      screen.getByText("Pairs are counted within each hospital, then added up"),
    ).toBeInTheDocument();
  });
});
