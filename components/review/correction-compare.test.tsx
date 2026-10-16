import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { makeCorrection } from "@/tests/corrections";
import { OriginalChip, OverdueChip, StatusChip } from "../corrections/chips";
import { ConsultationDialog } from "./consultation-dialog";
import { CorrectionCompare } from "./correction-compare";

const asthma = () => {
  const c = makeCorrection({ corrected_diagnosis: "Acute asthma, severe" });
  c.original.diagnosis = "Acute asthma, moderate";
  return c;
};

describe("CorrectionCompare", () => {
  it("marks what changed with a text cue, not colour alone", () => {
    render(<CorrectionCompare c={asthma()} mine={false} />);
    const before = screen.getByRole("region", { name: "What the system said" });
    const after = screen.getByRole("region", { name: "Suggested correction" });
    expect(before.querySelector("del")).toHaveTextContent("Removed: moderate");
    expect(before.querySelector("ins")).toBeNull();
    expect(after.querySelector("ins")).toHaveTextContent("Added: severe");
    expect(after.querySelector("del")).toBeNull();
    expect(before).toHaveTextContent("Acute asthma, Removed: moderate");
    expect(screen.getByText(/struck through/)).toBeVisible();
  });

  it("says who suggested it and why, and lists the evidence in words", () => {
    render(<CorrectionCompare c={makeCorrection()} mine={false} />);
    expect(
      screen.getByRole("region", { name: "Why (from Dr. Okafor)" }),
    ).toHaveTextContent("Persistent vomiting is a warning sign.");
    const evidence = screen.getByRole("region", { name: "Evidence on file" });
    const rows = within(evidence).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Verified");
    expect(rows[0]).toHaveTextContent(
      "WHO Dengue Guidelines 2024 · NS1 antigen test",
    );
    expect(rows[1]).toHaveTextContent("Needs review");
  });

  it("calls it yours when it is", () => {
    render(<CorrectionCompare c={makeCorrection()} mine />);
    expect(
      screen.getByRole("region", { name: "Your correction" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Your reason" })).toBeVisible();
  });

  it("shows the whole correction as added when the system gave no diagnosis", () => {
    const c = makeCorrection();
    c.original.diagnosis = null;
    c.original.citations = [];
    render(<CorrectionCompare c={c} mine={false} />);
    expect(screen.getByText("No diagnosis was given.")).toBeVisible();
    expect(
      screen
        .getByRole("region", { name: "Suggested correction" })
        .querySelector("ins"),
    ).toHaveTextContent("Dengue fever with warning signs: admit");
    expect(screen.getByText("No sources were cited.")).toBeVisible();
  });

  it("wraps very long and mixed-script text without losing any (Review Focus 5)", () => {
    const long = `${"x".repeat(2000)} 🙂 Café حمى ${"y".repeat(600)}`;
    render(
      <CorrectionCompare
        c={makeCorrection({ corrected_diagnosis: long, reason: long })}
        mine={false}
      />,
    );
    const after = screen.getByRole("region", { name: "Suggested correction" });
    const text = after.querySelector("p")!;
    // Every changed run carries a hidden "Added: "; the rest is the text itself.
    expect(text.textContent!.split("Added: ").join("")).toBe(long);
    expect(text.className).toContain("[overflow-wrap:anywhere]");
    const why = screen.getByRole("region", { name: "Why (from Dr. Okafor)" });
    expect(why.querySelector("p")!.className).toContain(
      "[overflow-wrap:anywhere]",
    );
  });
});

describe("chips", () => {
  it("pair every status with a word", () => {
    render(
      <>
        <StatusChip status="pending_review" />
        <StatusChip status="approved" />
        <StatusChip status="rejected" />
        <StatusChip status="withdrawn" />
        <OriginalChip
          original={{ decision: "PASS", degraded: true }}
          prefix="Original: "
        />
        <OverdueChip />
      </>,
    );
    for (const w of ["Waiting", "Approved", "Rejected", "Withdrawn"])
      expect(screen.getByText(w)).toBeVisible();
    // Degraded is never shown as a confidence level.
    expect(screen.getByText("Original: Needs review")).toBeVisible();
    expect(screen.getByText(/Over 4 h/)).toHaveTextContent("Over 4 h waiting");
  });
});

function DialogHost() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <ConsultationDialog
        c={makeCorrection()}
        mine={false}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

describe("ConsultationDialog", () => {
  it("shows the question as asked and the system's full answer, read only", async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    // Closed: the consultation's text is not in the DOM at all.
    expect(document.body).not.toHaveTextContent("Fever 3 days and rash");
    await user.click(screen.getByRole("button", { name: "open" }));
    const dialog = screen.getByRole("dialog", { name: "The consultation" });
    expect(dialog).toHaveTextContent(
      "Fever 3 days and rash, dengue area. Admit?",
    );
    expect(dialog).toHaveTextContent("24 years, female");
    expect(dialog).toHaveTextContent("Fever, Rash");
    expect(dialog).toHaveTextContent(
      "Admit if platelets fall below 100 × 10⁹/L",
    );
    expect(dialog).toHaveTextContent("Original: Use with caution");
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(document.body).not.toHaveTextContent("Fever 3 days and rash");
  });
});
