import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  HAVANA,
  HIDDEN,
  sampleRead,
  shown,
  type OkRead,
} from "@/tests/analysis-sample";
import { AffectedView } from "./affected-view";

const SHARE_AND_COUNT =
  /^(?:\d+% · [\d,]+|Not shown · Fewer than 5|Not shown · [\d,]+|Too few hospitals to show)$/;

function show(read: OkRead<"affected">, mode: "chart" | "table" = "chart") {
  return render(
    <AffectedView
      state={read}
      onRetry={() => {}}
      mode={mode}
      onMode={() => {}}
    />,
  );
}
const barTexts = (list: string) =>
  within(screen.getByRole("list", { name: list }))
    .getAllByRole("listitem")
    .map((li) => li.querySelector("b")!.textContent!);
const barLabels = (list: string) =>
  within(screen.getByRole("list", { name: list }))
    .getAllByRole("listitem")
    .map((li) => li.querySelector("span > span")!.textContent!);

const GROUPS = ["By age band", "By sex", "By setting", "By specialty"];

describe("Who is affected", () => {
  it("who is affected shows shares by band, sex, setting and specialty, with a hospital table across hospitals", async () => {
    const read = await sampleRead("affected");
    show(read);
    for (const g of GROUPS) {
      const texts = barTexts(g);
      expect(texts.length).toBeGreaterThan(0);
      for (const t of texts) expect(t).toMatch(SHARE_AND_COUNT);
    }
    // Age bands in their own order, never by size.
    expect(barLabels("By age band")).toEqual([
      "0–19",
      "20–39",
      "40–59",
      "60–79",
      "80 and over",
    ]);
    expect(
      screen.queryByRole("list", { name: "By ward or clinic" }),
    ).toBeNull();
    const table = screen.getByRole("table", { name: "By hospital" });
    expect(within(table).getAllByRole("row").slice(1)).toHaveLength(10);
    // No comparison for this view.
    expect(
      screen.queryByRole("region", { name: "Compared with similar hospitals" }),
    ).toBeNull();
  });

  it("ward or clinic only for one hospital", async () => {
    const read = await sampleRead("affected", HAVANA);
    show(read);
    for (const g of [...GROUPS, "By ward or clinic"])
      expect(screen.getByRole("list", { name: g })).toBeInTheDocument();
    for (const t of barTexts("By ward or clinic"))
      expect(t).toMatch(SHARE_AND_COUNT);
    // One hospital: the Plan 6 age bands.
    expect(barLabels("By age band")).toEqual([
      "0–17",
      "18–39",
      "40–64",
      "65–79",
      "80 and over",
    ]);
    expect(screen.queryByRole("table", { name: "By hospital" })).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Compared with similar hospitals" }),
    ).toBeNull();
  });

  it("a hidden share reads Not shown, beside its count or its hidden count", async () => {
    const read = await sampleRead("affected");
    const sex = read.data.data.by_sex;
    sex[0] = {
      ...sex[0]!,
      patients: { ...shown(25), drill: null },
      share: HIDDEN,
    };
    sex[1] = {
      ...sex[1]!,
      patients: { ...HIDDEN, drill: null },
      share: HIDDEN,
    };
    show(read);
    const texts = barTexts("By sex");
    expect(texts[0]).toBe("Not shown · 25");
    expect(texts[1]).toBe("Not shown · Fewer than 5");
  });

  it("hidden specialties come last whichever their size, by name", async () => {
    const read = await sampleRead("affected");
    const spec = read.data.data.by_specialty;
    expect(spec.length).toBeGreaterThan(2);
    const first = spec[0]!;
    spec[0] = { ...first, patients: { ...HIDDEN, drill: null }, share: HIDDEN };
    show(read);
    const labels = barLabels("By specialty");
    expect(labels.at(-1)).toBe(first.specialty ?? "Specialty not recorded");
    expect(barTexts("By specialty").at(-1)).toBe("Not shown · Fewer than 5");
  });

  it("each view has a Table with the same numbers (Who is affected)", async () => {
    const read = await sampleRead("affected", HAVANA);
    const { unmount } = show(read);
    const groups = [...GROUPS, "By ward or clinic"];
    const bars = new Map(groups.map((g) => [g, barTexts(g)]));
    unmount();
    show(read, "table");
    for (const g of groups) {
      const table = screen.getByRole("table", { name: g });
      expect(
        within(table)
          .getAllByRole("columnheader")
          .slice(1)
          .map((h) => h.textContent),
      ).toEqual(["Share", "Patients"]);
      const rows = within(table).getAllByRole("row").slice(1);
      expect(rows).toHaveLength(bars.get(g)!.length);
      rows.forEach((r, i) => {
        const [, share, patients] = within(r)
          .getAllByRole("cell")
          .map((c) => c.textContent!);
        const both = share === patients ? share : `${share} · ${patients}`;
        expect(bars.get(g)![i]).toBe(both);
      });
    }
  });
});
