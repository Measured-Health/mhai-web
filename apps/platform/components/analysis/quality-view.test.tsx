import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QualityData } from "@/lib/api/analysis-contract";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import {
  HAVANA,
  HIDDEN,
  sampleRead,
  shown,
  type OkRead,
} from "@/tests/analysis-sample";
import { ADA, GrabAuth, renderWithAuth } from "@/tests/render";
import { AnalysisGate } from "./analysis-gate";
import { QualityView } from "./quality-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/analysis",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

function show(read: OkRead<"quality">, mode: "chart" | "table" = "chart") {
  return render(
    <QualityView
      state={read}
      onRetry={() => {}}
      mode={mode}
      onMode={() => {}}
    />,
  );
}
const conditions = () =>
  within(screen.getByRole("list", { name: "By condition" })).getAllByRole(
    "listitem",
    { name: /./ },
  );

describe("MHAI quality", () => {
  it("per condition: the confidence mix, the agreement, reviewers and corrections", async () => {
    const read = await sampleRead("quality");
    show(read);
    const cards = conditions();
    expect(cards).toHaveLength(read.data.data.by_condition.length);
    const card = cards[0]!;
    const conf = within(card).getByRole("list", { name: /^Confidence/ });
    expect(
      within(conf)
        .getAllByRole("listitem")
        .map((li) => li.querySelector("span > span")!.textContent),
    ).toEqual(["High", "Medium", "Low"]);
    expect(card.textContent).toMatch(
      /Reviewers agreed (\d+% of [\d,]+ rated|: Not shown · [\d,]+ rated)|Fewer than 5 rated|No ratings yet/,
    );
    expect(card.textContent).toMatch(
      /Corrections: ([\d,]+|Fewer than 5) approved, ([\d,]+|Fewer than 5) rejected, ([\d,]+|Fewer than 5) waiting/,
    );
    // The headline is the agreement rate, as a percentage.
    expect(
      screen.getByText(
        /^Reviewers agreed .+ rated, [A-Z][a-z]{2} \d{4} to [A-Z][a-z]{2} \d{4}\.$/,
      ),
    ).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "By hospital" });
    expect(
      within(table).getByRole("columnheader", { name: /Reviewers agreed/ }),
    ).toBeInTheDocument();
  });

  it("quality shows reviewers as a number and no names", async () => {
    const read = await sampleRead("quality");
    const { container } = show(read);
    for (const card of conditions()) {
      const line = within(card).getByText(/reviewers?$/);
      expect(line.textContent).toMatch(/^(?:[\d,]+|Fewer than 5) reviewers$/);
    }
    // The sample's reviewers are r1, r2, …: none of them ever shows.
    expect(container.textContent).not.toMatch(/\br\d+\b/);
  });

  it("a hidden agreement beside shown ratings reads Not shown", async () => {
    const read = await sampleRead("quality");
    const rows = read.data.data.by_condition;
    rows[0] = { ...rows[0]!, rated: shown(25), agreement_rate: HIDDEN };
    show(read);
    expect(conditions()[0]!.textContent).toContain(
      "Reviewers agreed: Not shown · 25 rated",
    );
  });

  it("One hospital: the comparison on the agreement rate, as a percentage", async () => {
    const read = await sampleRead("quality", HAVANA);
    show(read);
    const panel = screen.getByRole("region", {
      name: "Compared with similar hospitals",
    });
    expect(panel.textContent).not.toMatch(/per 1,000/);
    expect(panel.textContent).toMatch(
      /\d+%|No earlier data|Not enough|Not compared/,
    );
  });

  it("each view has a Table with the same numbers (Quality)", async () => {
    const read = await sampleRead("quality");
    const { unmount } = show(read);
    const cards = conditions().map((c) => c.textContent!);
    unmount();
    show(read, "table");
    const table = screen.getByRole("table", { name: "By condition" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "Condition",
      "Consultations",
      "High confidence",
      "Medium confidence",
      "Low confidence",
      "Rated",
      "Reviewers agreed",
      "Reviewers",
      "Approved",
      "Rejected",
      "Waiting",
    ]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(cards.length);
    rows.forEach((r, i) => {
      const c = within(r)
        .getAllByRole("cell")
        .map((x) => x.textContent!);
      expect(cards[i]).toContain(c[0]);
      expect(cards[i]).toContain(`High${c[2]}`);
      expect(cards[i]).toContain(`Medium${c[3]}`);
      expect(cards[i]).toContain(`Low${c[4]}`);
      expect(cards[i]).toContain(`${c[7]} reviewers`);
      expect(cards[i]).toContain(
        `Corrections: ${c[8]} approved, ${c[9]} rejected, ${c[10]} waiting`,
      );
    });
  });
});

describe("MHAI quality failing closed", () => {
  it("a confidence set with one hidden member fails quality closed, and the others keep working", async () => {
    const api = createMockPlatform({ delayMs: 0, me: () => ADA.email });
    __setPlatformClientForTests(api);
    const real = api.getAnalysisView.bind(api);
    vi.spyOn(api, "getAnalysisView").mockImplementation(async (view, q) => {
      const raw = await real(view, q);
      if (view !== "quality" || "unavailable" in raw) return raw;
      const data = (raw as { data: QualityData }).data;
      // One member hidden, the others and the total shown: it is given away.
      const row = data.by_condition.find(
        (r) =>
          !r.consultations.suppressed &&
          !r.confidence.high.suppressed &&
          !r.confidence.medium.suppressed &&
          (r.consultations.value ?? 0) > 20,
      )!;
      row.confidence.low = { value: null, suppressed: true };
      return raw;
    });
    renderWithAuth(
      <>
        <GrabAuth />
        <AnalysisGate />
      </>,
      {
        user: ADA,
        queryClient: new QueryClient({
          defaultOptions: { queries: { retry: false } },
        }),
      },
    );
    await screen.findByText(/^Updated \d\d:\d\d$/);
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "MHAI quality" }));
    expect(
      await screen.findByText("Couldn't load MHAI quality"),
    ).toBeInTheDocument();
    const section = screen
      .getByRole("heading", { level: 2, name: "MHAI quality" })
      .closest("section")!;
    expect(section.textContent).not.toMatch(/\d/);
    // The other views keep working.
    await user.click(screen.getByRole("tab", { name: "Findings and alerts" }));
    expect(
      await screen.findByRole("list", { name: "Findings" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Who is affected" }));
    expect(
      await screen.findByRole("list", { name: "By age band" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/^Couldn't load/)).toBeNull(),
    );
  });
});
