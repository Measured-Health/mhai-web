import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ClinicalResultOut } from "@/lib/api/contract";
import { FIXTURES } from "@/lib/api/fixtures";
import { FORBIDDEN_TERMS } from "@/lib/labels";
import { toResultView } from "@/lib/result-view";
import { HighlightProvider } from "@/lib/highlight";
import { parseBody } from "../result/parse-body";
import { ResultCard } from "../result/result-card";
import { EvidenceDock } from "./evidence-dock";
import { EvidencePanel } from "./evidence-panel";

const panel = (r: ClinicalResultOut) =>
  render(
    <HighlightProvider>
      <EvidencePanel view={toResultView(r)} />
    </HighlightProvider>,
  );
const dock = (r: ClinicalResultOut) =>
  render(
    <HighlightProvider>
      <EvidenceDock view={toResultView(r)} />
    </HighlightProvider>,
  );
const sheet = () =>
  screen.getByRole("dialog", { name: "Evidence and safety", hidden: true });

describe("EvidencePanel", () => {
  it("shows safety checks with counts, only measures the API returned, and grouped sources", () => {
    panel(FIXTURES.high);
    expect(screen.getByText("Patient data protected")).toBeInTheDocument();
    expect(screen.getByText("4 of 4 claims verified")).toBeInTheDocument();
    expect(screen.getByText("Evidence match")).toBeInTheDocument();
    expect(screen.queryByText("Answer stability")).toBeNull();
    expect(
      screen.getByText("AHA 2021 Chest Pain Guideline"),
    ).toBeInTheDocument();
    expect(screen.getByText("Used 2 times")).toBeInTheDocument();
  });
  it("warns when some claims need review", () => {
    panel(FIXTURES.caution);
    expect(
      screen.getByText("1 recommendation needs review"),
    ).toBeInTheDocument();
  });
  it("omits 'Consistent reasoning' when the API returned no stability", () => {
    panel(FIXTURES.high);
    expect(screen.queryByText("Consistent reasoning")).toBeNull();
  });
  it("shows 'Consistent reasoning' when stability is present", () => {
    panel({
      ...FIXTURES.high,
      guardrail_details: {
        ...FIXTURES.high.guardrail_details,
        l2_entropy: { stability: 0.8 },
      },
    });
    expect(screen.getByText("Consistent reasoning")).toBeInTheDocument();
  });
  it("review with every claim verified: claims line is not green", () => {
    panel({ ...FIXTURES.high, degraded: true });
    const line = screen.getByText("4 of 4 claims verified").closest("p")!;
    expect(line.querySelector("[data-tone]")).not.toHaveAttribute(
      "data-tone",
      "ok",
    );
  });
  it("renders every measure the API returned, and only those", () => {
    panel({
      ...FIXTURES.high,
      guardrail_details: {
        ...FIXTURES.high.guardrail_details,
        l2_entropy: { stability: 0.71 },
      },
    });
    const meters = screen.getAllByRole("meter");
    expect(meters.map((m) => m.getAttribute("aria-label"))).toEqual([
      "Evidence match",
      "Answer stability",
    ]);
    expect(meters[1]).toHaveAttribute("aria-valuenow", "71");
  });
  it("hides the confidence section when no measures exist", () => {
    panel({
      ...FIXTURES.high,
      guardrail_details: {
        ...FIXTURES.high.guardrail_details,
        l3_nli: { pass_rate: 0, claims_checked: 0, model_loaded: true },
      },
    });
    expect(screen.queryByText("Why this confidence")).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
  });
  it("review: hides 'Why this confidence' and its % bars entirely", () => {
    panel({
      ...FIXTURES.high,
      degraded: true,
      guardrail_details: {
        ...FIXTURES.high.guardrail_details,
        l2_entropy: { stability: 0.9 },
      },
    });
    expect(screen.queryByText("Why this confidence")).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });
  it.each(["high", "caution"] as const)(
    "%s with a null score shows no confidence bars",
    (k) => {
      panel({ ...FIXTURES[k], trust_score: null });
      expect(screen.queryByText("Why this confidence")).toBeNull();
      expect(screen.queryByRole("meter")).toBeNull();
    },
  );
  it("no citations: a plain message, no sources section, no false all-clear", () => {
    panel({ ...FIXTURES.high, citations: [] });
    expect(
      screen.getByText("No sources were used for this answer."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sources used" })).toBeNull();
    expect(screen.queryByText(/0 of 0/)).toBeNull();
    expect(
      screen.getByText("No claims could be checked against guidelines"),
    ).toBeInTheDocument();
  });
  it("labels source status with words from sourceStatus", () => {
    panel(FIXTURES.review);
    const src = screen.getByRole("region", { name: "Sources used" });
    expect(within(src).getByText("Removed")).toBeInTheDocument();
    expect(within(src).getByText("Used 2 times")).toBeInTheDocument();
  });
});

describe("EvidenceDock", () => {
  it("renders the side column and a summary bar that opens a tabbed sheet", () => {
    dock(FIXTURES.high);
    expect(
      screen.getByRole("complementary", { name: "Evidence and safety" }),
    ).toHaveTextContent("4 of 4 claims verified");
    expect(sheet().parentElement).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(screen.getByRole("button", { name: /Evidence & safety/ }));
    expect(sheet().parentElement).toHaveAttribute("aria-hidden", "false");
    const tabs = within(sheet()).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Checks",
      "Why this confidence",
      "Sources · 3",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.click(tabs[2]);
    expect(
      within(sheet()).getByRole("tabpanel", { name: /Sources/ }),
    ).toHaveTextContent("NICE CG95");
  });
  it("moves between tabs with arrow keys", () => {
    dock(FIXTURES.high);
    fireEvent.click(screen.getByRole("button", { name: /Evidence & safety/ }));
    const tabs = within(sheet()).getAllByRole("tab");
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveFocus();
    fireEvent.keyDown(tabs[1], { key: "ArrowLeft" });
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
  });
  it("review with every claim verified: summary bar is not green", () => {
    dock({ ...FIXTURES.high, degraded: true });
    const bar = screen.getByRole("button", { name: /Evidence & safety/ });
    expect(bar.querySelector("[data-tone]")).not.toHaveAttribute(
      "data-tone",
      "ok",
    );
  });
  it("high with every claim verified: summary bar is green", () => {
    dock(FIXTURES.high);
    const bar = screen.getByRole("button", { name: /Evidence & safety/ });
    expect(bar.querySelector("[data-tone]")).toHaveAttribute("data-tone", "ok");
  });
  it("review: no 'Why this confidence' tab", () => {
    dock(FIXTURES.review);
    expect(
      within(sheet()).queryByRole("tab", {
        name: /Why this confidence/,
        hidden: true,
      }),
    ).toBeNull();
    expect(screen.queryByText("Why this confidence")).toBeNull();
  });
  it("null score: no 'Why this confidence' tab", () => {
    dock({ ...FIXTURES.high, trust_score: null });
    expect(screen.queryByText("Why this confidence")).toBeNull();
  });
  it("summary bar never claims an all-clear when nothing was checked", () => {
    dock({ ...FIXTURES.high, citations: [] });
    const bar = screen.getByRole("button", { name: /Evidence & safety/ });
    expect(bar).toHaveTextContent("No claims checked");
    expect(bar).not.toHaveTextContent(/0 of 0|0 sources/);
  });
});

describe("clinician wording", () => {
  it.each(Object.keys(FIXTURES) as (keyof typeof FIXTURES)[])(
    "%s: no backend terms in any rendered text, label or title",
    (k) => {
      const r = FIXTURES[k];
      const view = toResultView(r);
      const { container } = render(
        <HighlightProvider>
          <ResultCard
            view={view}
            parsed={parseBody(r.response_text, r.citations)}
          />
          <EvidenceDock view={view} />
        </HighlightProvider>,
      );
      fireEvent.click(
        screen.getByRole("button", { name: /Evidence & safety/ }),
      );
      const texts = [container.textContent ?? ""];
      for (const tab of within(sheet()).getAllByRole("tab")) {
        fireEvent.click(tab);
        texts.push(container.textContent ?? "");
      }
      container
        .querySelectorAll("[title],[aria-label]")
        .forEach((el) =>
          texts.push(
            `${el.getAttribute("title") ?? ""} ${el.getAttribute("aria-label") ?? ""}`,
          ),
        );
      const shown = texts.join(" ");
      for (const term of FORBIDDEN_TERMS)
        expect(shown).not.toMatch(new RegExp(`\\b${term}\\b`, "i"));
    },
  );
});
