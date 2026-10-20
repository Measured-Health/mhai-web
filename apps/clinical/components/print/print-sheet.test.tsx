import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClinicalResultOut, QueryCreateIn } from "@/lib/api/contract";
import { FIXTURES } from "@/lib/api/fixtures";
import { FORBIDDEN_TERMS } from "@/lib/labels";
import { toResultView } from "@/lib/result-view";
import { parseBody } from "../result/parse-body";
import { PrintSheet } from "./print-sheet";

const query = {
  question: "q",
  urgency: "routine",
  patient_data: { age: 54, sex: "male", symptoms: ["chest pain"] },
} as unknown as QueryCreateIn;

const sheet = (r: ClinicalResultOut, agreedAt?: number) =>
  render(
    <PrintSheet
      view={toResultView(r)}
      parsed={parseBody(r.response_text, r.citations)}
      query={query}
      agreedAt={agreedAt}
      printedAt="now"
    />,
  );

afterEach(() => vi.unstubAllEnvs());

describe("PrintSheet", () => {
  it("adds no clinician name", () => {
    const { container } = sheet(FIXTURES.high);
    expect(container.textContent).not.toMatch(/Requested by|Reyes|Havana/);
  });
  it("shows the clinician-agreed footer only when agreedAt is set", () => {
    expect(sheet(FIXTURES.high).container.textContent).not.toContain(
      "Clinician agreed",
    );
    const { container } = sheet(FIXTURES.high, 1_700_000_000_000);
    expect(container.textContent).toContain("Clinician agreed ·");
  });
  it("shows the demo line only while mock mode is on", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    expect(sheet(FIXTURES.high).container.textContent).toContain(
      "Demo · sample data, not for clinical use",
    );
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    expect(sheet(FIXTURES.high).container.textContent).not.toContain("Demo ·");
  });
  it("prints the screen's banner copy: neutral for degraded results", () => {
    const t = sheet({ ...FIXTURES.high, degraded: true }).container.textContent;
    expect(t).toContain(
      "Checks ran in a reduced mode, so this answer needs clinician review before use.",
    );
    expect(t).not.toMatch(/evidence didn't support/);
  });
  it("keeps the review eyebrow and the reduced-accuracy notice", () => {
    const t = sheet(FIXTURES.review).container.textContent;
    expect(t).toContain("Possible assessment · not verified");
    expect(t).toContain(
      "Evidence checking is running in reduced-accuracy mode.",
    );
    const h = sheet(FIXTURES.high).container.textContent;
    expect(h).not.toContain("Possible assessment");
    expect(h).not.toContain("reduced-accuracy");
  });
  it("keeps the caution banner when the score is null", () => {
    const t =
      sheet({ ...FIXTURES.caution, trust_score: null }).container.textContent ??
      "";
    expect(t).toContain("Use with caution");
  });
  it("labels a review sign-off 'Clinician reviewed' and omits the line for corrections", () => {
    const base = {
      view: toResultView(FIXTURES.review),
      parsed: parseBody(
        FIXTURES.review.response_text,
        FIXTURES.review.citations,
      ),
      query,
      agreedAt: 1_700_000_000_000,
      printedAt: "now",
    };
    const a = render(<PrintSheet {...base} feedback="reviewed" />);
    expect(a.container.textContent).toContain("Clinician reviewed ·");
    expect(a.container.textContent).not.toContain("Clinician agreed");
    a.unmount();
    const b = render(<PrintSheet {...base} feedback="correct" />);
    expect(b.container.textContent).not.toMatch(/Clinician (agreed|reviewed)/);
  });
  it("review: banner and no confidence; null score: no confidence; null icd: no ICD", () => {
    const rev = sheet(FIXTURES.review).container.textContent ?? "";
    expect(rev).toMatch(/needs clinician review/i);
    expect(rev).not.toMatch(/confidence/i);
    const none =
      sheet({ ...FIXTURES.high, trust_score: null, icd10_code: null }).container
        .textContent ?? "";
    expect(none).not.toMatch(/confidence/i);
    expect(none).not.toContain("ICD-10");
  });
  it("shows consistent reasoning only with stability", () => {
    expect(sheet(FIXTURES.high).container.textContent).not.toMatch(
      /consistent reasoning/i,
    );
    const r: ClinicalResultOut = {
      ...FIXTURES.high,
      guardrail_details: {
        ...FIXTURES.high.guardrail_details,
        l2_entropy: { stability: 0.9 },
      },
    };
    expect(sheet(r).container.textContent).toMatch(/consistent reasoning/i);
  });
  it.each(Object.entries(FIXTURES))("uses no forbidden words (%s)", (_k, r) => {
    const t = sheet(r).container.textContent ?? "";
    for (const term of FORBIDDEN_TERMS)
      expect(t).not.toMatch(new RegExp(`\\b${term}\\b`, "i"));
  });
});
