import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClinicalResultOut } from "@/lib/api/contract";
import { FIXTURES } from "@/lib/api/fixtures";
import { toResultView } from "@/lib/result-view";
import { HighlightProvider } from "@/lib/highlight";
import { ToastProvider } from "../ui/toast";
import { parseBody } from "./parse-body";
import { ResultCard } from "./result-card";

const renderFor = (r: ClinicalResultOut) =>
  render(
    <HighlightProvider>
      <ResultCard
        view={toResultView(r)}
        parsed={parseBody(r.response_text, r.citations)}
      />
    </HighlightProvider>,
  );

const realClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  if (realClipboard)
    Object.defineProperty(navigator, "clipboard", realClipboard);
  else delete (navigator as { clipboard?: unknown }).clipboard;
});

describe("ResultCard", () => {
  it("high: pill, diagnosis, ICD chip, cited steps, time and disclaimer", () => {
    renderFor(FIXTURES.high);
    expect(
      screen.getByRole("status", { name: /High confidence/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Unstable angina" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ICD-10 I20.0/ }),
    ).toHaveAttribute(
      "title",
      "ICD-10 diagnosis code: Unstable angina. Click to copy.",
    );
    expect(screen.getAllByText(/Verified/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Completed in 11.8 s/)).toBeInTheDocument();
    expect(screen.getByText("3 sources")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Final clinical judgement rests with the treating clinician/,
      ),
    ).toBeInTheDocument();
  });
  it("review: red banner, no confidence pill, 'possible assessment', removed claim struck through", () => {
    renderFor(FIXTURES.review);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This result needs clinician review before any clinical action is taken",
    );
    expect(screen.queryByRole("status", { name: /confidence/i })).toBeNull();
    expect(
      screen.getByText(/Possible assessment · not verified/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/IV potassium 40 mmol/).closest("s"),
    ).not.toBeNull();
    expect(screen.getByText(/reduced-accuracy mode/)).toBeInTheDocument();
  });
  it("review: never shows a confidence pill, even with a high score", () => {
    renderFor({ ...FIXTURES.high, degraded: true, trust_score: 0.99 });
    expect(screen.queryByRole("status", { name: /confidence/i })).toBeNull();
    expect(screen.queryByText(/High/)).toBeNull();
  });
  it("caution: shows the caution pill and banner", () => {
    renderFor(FIXTURES.caution);
    expect(
      screen.getByRole("status", { name: /Use with caution/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "1 recommendation couldn't be matched to a guideline",
    );
  });
  it.each(["high", "caution"] as const)(
    "%s with a null score shows no confidence pill",
    (k) => {
      renderFor({ ...FIXTURES[k], trust_score: null });
      expect(
        screen.queryByRole("status", { name: /confidence|caution/i }),
      ).toBeNull();
      expect(screen.queryByText(/of 5 bars/)).toBeNull();
    },
  );
  it("copies the ICD-10 code and confirms only after the copy succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const r = FIXTURES.high;
    render(
      <ToastProvider>
        <ResultCard
          view={toResultView(r)}
          parsed={parseBody(r.response_text, r.citations)}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /ICD-10 I20.0/ }));
    expect(writeText).toHaveBeenCalledWith("I20.0");
    expect(await screen.findByText("ICD-10 code copied")).toBeInTheDocument();
  });
  it("says so when the code can't be copied", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const r = FIXTURES.high;
    render(
      <ToastProvider>
        <ResultCard
          view={toResultView(r)}
          parsed={parseBody(r.response_text, r.citations)}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /ICD-10 I20.0/ }));
    expect(
      await screen.findByText("Couldn't copy the code"),
    ).toBeInTheDocument();
    expect(screen.queryByText("ICD-10 code copied")).toBeNull();
  });
  it("hides the ICD chip when the code is null", () => {
    renderFor({ ...FIXTURES.high, icd10_code: null });
    expect(screen.queryByRole("button", { name: /ICD-10/ })).toBeNull();
    expect(screen.queryByText(/ICD-10/)).toBeNull();
  });
  it("renders without citations: no source count, no tags, steps kept", () => {
    renderFor({ ...FIXTURES.high, citations: [] });
    expect(
      screen.getByRole("heading", { name: "Unstable angina" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\bsources?\b/)).toBeNull();
    expect(screen.queryByText(/Verified/)).toBeNull();
    expect(screen.getByText(/12-lead ECG/)).toBeInTheDocument();
  });
  it("renders with an empty answer: plain message, no empty body chrome", () => {
    renderFor({
      ...FIXTURES.review,
      response_text: "",
      response_available: false,
      citations: [],
    });
    expect(
      screen.getByText(
        "The written assessment isn't available for this result.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Recommended next steps")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("renders with every optional field empty at once", () => {
    renderFor({
      ...FIXTURES.high,
      diagnosis: null,
      trust_score: null,
      icd10_code: null,
      citations: [],
      response_text: "",
      response_available: false,
    });
    expect(
      screen.getByRole("heading", { name: "Clinical assessment" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /confidence/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /ICD-10/ })).toBeNull();
  });
  it("never shows backend terms", () => {
    const { container } = renderFor(FIXTURES.caution);
    expect(container.textContent).not.toMatch(
      /trust score|NLI|entropy|REGENERATE|ESCALATE|\bPASS\b/,
    );
  });
});
