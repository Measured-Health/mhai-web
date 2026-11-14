import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import type { QueryCreateIn } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import {
  askFromAlert,
  patientFromAlert,
  readPrefill,
  stashPrefill,
} from "@/lib/notifications/ask";
import { useSession, type SessionItem } from "@/lib/session-store";
import { ALERT_NOW, makeAlert } from "@/tests/alerts";
import { TEST_USER } from "@/tests/auth-wrapper";

const push = vi.fn();
const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/",
  useSearchParams: () => search,
}));
const createQuery = vi.fn(async () => ({ query_id: "q2" }));
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({
    createQuery,
    getReadiness: async () => ({ ok: true, degraded_services: [] }),
  }),
}));

const lookupPatient = vi.fn();
vi.mock("@/lib/api/lookup", () => ({
  getLookupClient: () => ({ lookupPatient }),
}));

import Page from "@/app/(clinical)/(clinician)/page";
import { AppShell } from "@/components/shell/app-shell";

const QUERY: QueryCreateIn = {
  clinical_question: "Central chest pain for 40 min. Likely diagnosis?",
  urgency: "urgent",
  specialty: "Emergency",
  patient_data: {
    age: 54,
    sex: "male",
    symptoms: ["Chest pain"],
    medical_history: "Smoker",
  },
};
const ITEM: SessionItem = {
  id: "q1",
  title: "Chest pain, 54 M",
  urgency: "urgent",
  createdAt: 1,
  kind: "failed",
  query: QUERY,
};
function Seeded({ children }: { children: ReactNode }) {
  const s = useSession();
  const { add } = s;
  useEffect(() => add(ITEM), [add]);
  return s.get("q1") ? children : null;
}

const mount = async (node: ReactNode) => {
  await act(async () => {
    render(<Providers>{node}</Providers>);
  });
};

beforeEach(() => {
  search = new URLSearchParams();
  push.mockClear();
  replace.mockClear();
  createQuery.mockClear();
  lookupPatient.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("Home", () => {
  it("welcomes a first visit and fills the form from an example, then submits", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await mount(<Page />);
    expect(
      screen.getByRole("heading", { name: "Ask your first clinical question" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Febrile child/ }),
    );
    expect(screen.getByLabelText(/^Age/)).toHaveValue("3");
    expect(screen.getByText("Draft · not submitted")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/c/q2"));
    // Next keeps the page mounted, so the form must be fresh for next time.
    await vi.waitFor(
      () => expect(screen.getByLabelText(/^Age/)).toHaveValue(""),
      { timeout: 5000 }, // a transition; slow under a parallel full run
    );
    expect(createQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_data: expect.objectContaining({ age: 3, sex: "female" }),
      }),
      { idempotencyKey: expect.any(String) },
    );
    expect(setItem).not.toHaveBeenCalled();
  });

  it("goes straight to the form once the session has history", async () => {
    await mount(
      <Seeded>
        <Page />
      </Seeded>,
    );
    expect(
      screen.getByRole("heading", {
        name: "What's going on with your patient?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Age/)).toHaveValue("");
  });

  it("pre-fills the form from ?edit=<id> after a failed query", async () => {
    search = new URLSearchParams("edit=q1");
    await mount(
      <Seeded>
        <Page />
      </Seeded>,
    );
    expect(screen.getByLabelText(/^Age/)).toHaveValue("54");
    expect(screen.getByLabelText(/^Clinical question/)).toHaveValue(
      QUERY.clinical_question,
    );
    expect(screen.getByLabelText(/^Specialty area/)).toHaveValue("Emergency");
    expect(screen.getByLabelText(/^Medical history/)).toHaveValue("Smoker");
    expect(screen.getByRole("radio", { name: "Male" })).toBeChecked();
  });

  it("offline, Analyse saves the question and shows Waiting to send in place", async () => {
    await new Promise<void>((r) => {
      const req = indexedDB.deleteDatabase("mhai-outbox");
      req.onsuccess = req.onerror = req.onblocked = () => r();
    });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const pushState = vi.spyOn(window.history, "pushState");
    const tree = () => (
      <Providers auth={{ initialUser: TEST_USER }}>
        <Seeded>
          <Page />
        </Seeded>
      </Providers>
    );
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(tree());
    });
    search = new URLSearchParams("edit=q1");
    view.rerender(tree());
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    await vi.waitFor(() => expect(pushState).toHaveBeenCalled());
    expect(createQuery).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    const url = String(pushState.mock.calls[0]![2]);
    expect(url).toMatch(/^\/\?waiting=local-/);
    search = new URLSearchParams(url.slice(2));
    view.rerender(tree());
    expect(
      await screen.findByRole("heading", { name: "Waiting to send" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/saved securely on this device/)).toBeVisible();
  });

  it("asks before New consultation mid-draft, and Discard gives a clean form", async () => {
    await mount(
      <Seeded>
        <AppShell>
          <Page />
        </AppShell>
      </Seeded>,
    );
    await userEvent.type(screen.getByLabelText(/^Age/), "54");
    await userEvent.click(
      screen.getAllByRole("link", { name: /New consultation/ })[0],
    );
    expect(
      screen.getByRole("dialog", { name: "Discard this draft?" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Age/)).toHaveValue("54");
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(push).toHaveBeenCalledWith("/");
    expect(screen.getByLabelText(/^Age/)).toHaveValue("");
    expect(screen.queryByText("Draft · not submitted")).not.toBeInTheDocument();
  });
});

describe("Home from a patient alert", () => {
  const values = () => askFromAlert(makeAlert(), ALERT_NOW);
  const arrive = () => {
    const token = stashPrefill(values());
    search = new URLSearchParams({ prefill: token });
    return token;
  };

  it("fills the form from the alert, without the name or MRN (R11)", async () => {
    const token = arrive();
    await mount(<Page />);
    expect(
      screen.getByText(
        "Filled in from a patient alert. The patient's name and record number weren't copied. Check the details before you analyse.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Age/)).toHaveValue("67");
    expect(screen.getByRole("radio", { name: "Female" })).toBeChecked();
    expect(screen.getByLabelText(/^Clinical question/)).toHaveValue(
      values().question,
    );
    expect(values().question).toMatch(/^Potassium 2\.9 mmol\/L/);
    // Nothing identifying anywhere in the rendered form, its field values or the URL.
    const rendered = [
      document.body.textContent ?? "",
      ...Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          "input, textarea, select",
        ),
        (e) => e.value,
      ),
      search.toString(),
    ].join("\n");
    expect(rendered).not.toMatch(/Maryam|Abdullahi|204817|Ward 3|Bed 12/);
    expect(search.toString()).toBe(`prefill=${token}`);
  });

  it("leaves the prefill editable", async () => {
    arrive();
    await mount(<Page />);
    const q = screen.getByLabelText(/^Clinical question/);
    await userEvent.clear(q);
    await userEvent.type(q, "My own words");
    expect(q).toHaveValue("My own words");
    await userEvent.clear(screen.getByLabelText(/^Age/));
    await userEvent.type(screen.getByLabelText(/^Age/), "70");
    expect(screen.getByLabelText(/^Age/)).toHaveValue("70");
  });

  it("forgets the prefill once the question is sent", async () => {
    const token = arrive();
    await mount(<Page />);
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/c/q2"));
    expect(createQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        clinical_question: values().question,
        urgency: "emergency",
        patient_data: expect.objectContaining({ age: 67, sex: "female" }),
      }),
      { idempotencyKey: expect.any(String) },
    );
    expect(readPrefill(token)).toBeNull();
  });

  it("forgets the prefill when the draft is discarded", async () => {
    const token = arrive();
    await mount(
      <AppShell>
        <Page />
      </AppShell>,
    );
    await userEvent.type(screen.getByLabelText(/^Age/), "1");
    await userEvent.click(
      screen.getAllByRole("link", { name: /New consultation/ })[0],
    );
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByLabelText(/^Age/)).toHaveValue("");
    expect(screen.queryByText(/Filled in from a patient alert/)).toBeNull();
    expect(readPrefill(token)).toBeNull();
  });

  it("forgets the prefill when an example is chosen", async () => {
    const token = arrive();
    await mount(<Page />);
    await userEvent.click(
      screen.getByRole("button", { name: /Febrile child/ }),
    );
    expect(screen.getByLabelText(/^Age/)).toHaveValue("3");
    expect(screen.queryByText(/Filled in from a patient alert/)).toBeNull();
    expect(readPrefill(token)).toBeNull();
  });

  it("gives the normal first visit for an unknown or stale token, quietly", async () => {
    search = new URLSearchParams({ prefill: "unknown12345" });
    await mount(<Page />);
    expect(
      screen.getByRole("heading", { name: "Ask your first clinical question" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Filled in from a patient alert/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("takes the token out of the address once it has been read", async () => {
    arrive();
    await mount(<Page />);
    expect(replace).toHaveBeenCalledWith("/");
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("takes an unknown token out of the address too", async () => {
    search = new URLSearchParams({ prefill: "unknown12345" });
    await mount(<Page />);
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("an edit wins over a prefill, and the prefill is forgotten", async () => {
    const token = stashPrefill(values());
    search = new URLSearchParams({ edit: "q1", prefill: token });
    await mount(
      <Seeded>
        <Page />
      </Seeded>,
    );
    expect(screen.getByLabelText(/^Age/)).toHaveValue("54");
    expect(screen.queryByText(/Filled in from a patient alert/)).toBeNull();
    expect(readPrefill(token)).toBeNull();
    expect(replace).toHaveBeenCalledWith("/?edit=q1");
  });

  describe("with an unsaved draft on the kept-alive page", () => {
    const open = async () => {
      const tree = () => (
        <Providers>
          <Seeded>
            <Page />
          </Seeded>
        </Providers>
      );
      let view!: ReturnType<typeof render>;
      await act(async () => {
        view = render(tree());
      });
      const ask = (age: number) => {
        const t = stashPrefill(askFromAlert(makeAlert({ age }), ALERT_NOW));
        search = new URLSearchParams({ prefill: t });
        view.rerender(tree());
        return t;
      };
      return { ask };
    };

    it("asks first, and Keep my draft leaves it untouched", async () => {
      const { ask } = await open();
      await userEvent.type(screen.getByLabelText(/^Clinical question/), "xyz");
      const draft = (screen.getByLabelText(/^Age/) as HTMLInputElement).value;
      const q = (
        screen.getByLabelText(/^Clinical question/) as HTMLInputElement
      ).value;
      const t = ask(71);
      expect(
        screen.getByRole("dialog", { name: "Replace your draft?" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/^Age/)).toHaveValue(draft);
      await userEvent.click(
        screen.getByRole("button", { name: "Keep my draft" }),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByLabelText(/^Age/)).toHaveValue(draft);
      expect(screen.getByLabelText(/^Clinical question/)).toHaveValue(q);
      expect(screen.queryByText(/Filled in from a patient alert/)).toBeNull();
      expect(readPrefill(t)).toBeNull();
      expect(replace).toHaveBeenCalledWith("/");
    });

    it("Replace applies the alert's details", async () => {
      const { ask } = await open();
      await userEvent.type(screen.getByLabelText(/^Clinical question/), "xyz");
      ask(71);
      await userEvent.click(screen.getByRole("button", { name: "Replace" }));
      expect(screen.getByLabelText(/^Age/)).toHaveValue("71");
      expect(screen.getByLabelText(/^Clinical question/)).toHaveValue(
        values().question,
      );
      expect(screen.getByText(/Filled in from a patient alert/)).toBeVisible();
    });

    it("with no draft the alert applies at once; a second alert asks", async () => {
      const { ask } = await open();
      ask(60);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByLabelText(/^Age/)).toHaveValue("60");
      await userEvent.type(screen.getByLabelText(/^Clinical question/), " ok");
      ask(72);
      expect(
        screen.getByRole("dialog", { name: "Replace your draft?" }),
      ).toBeVisible();
      expect(screen.getByLabelText(/^Age/)).toHaveValue("60");
      await userEvent.click(screen.getByRole("button", { name: "Replace" }));
      expect(screen.getByLabelText(/^Age/)).toHaveValue("72");
    });

    it("can't replace the draft while it is being sent, and says why (F16)", async () => {
      createQuery.mockImplementationOnce(
        () => new Promise<{ query_id: string }>(() => {}),
      );
      const { ask } = await open();
      ask(60);
      await userEvent.type(screen.getByLabelText(/^Clinical question/), " ok");
      await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
      await vi.waitFor(() => expect(createQuery).toHaveBeenCalledTimes(1));
      ask(72);
      const dialog = screen.getByRole("dialog", {
        name: "Replace your draft?",
      });
      const replaceButton = within(dialog).getByRole("button", {
        name: "Replace",
      });
      expect(replaceButton).toBeDisabled();
      expect(replaceButton).toHaveAccessibleDescription(
        "Your question is being sent. Wait for it to finish.",
      );
      expect(
        within(dialog).getByRole("button", { name: "Keep my draft" }),
      ).toBeEnabled();
    });
  });

  it("signing out forgets the prefill", async () => {
    const token = stashPrefill(values());
    function SignOut() {
      const { clear } = useSession();
      return <button onClick={clear}>Sign out</button>;
    }
    await mount(<SignOut />);
    expect(readPrefill(token)).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(readPrefill(token)).toBeNull();
  });
});

describe("Home: a question about a patient (core 1.22.0 patient_id)", () => {
  const PID = "6f1c2a01-5e1d-4c3b-9a7e-000000000001";
  const alert = () =>
    makeAlert({
      patient: { ...makeAlert().patient, id: PID },
    });
  const arrive = () => {
    const a = alert();
    const token = stashPrefill(askFromAlert(a, ALERT_NOW), patientFromAlert(a));
    search = new URLSearchParams({ prefill: token });
    return token;
  };
  const sentWith = (n = 0) =>
    (createQuery.mock.calls[n] as unknown as [QueryCreateIn])[0];

  it("is linked from the alert, shows who, and sends only the id", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const token = arrive();
    await mount(<Page />);
    const about = screen.getByRole("group", { name: "About patient" });
    expect(about).toHaveTextContent("Maryam Abdullahi");
    expect(about).toHaveTextContent("204817");
    // The question itself carries neither, and the address only the token.
    expect(
      (screen.getByLabelText(/^Clinical question/) as HTMLTextAreaElement)
        .value,
    ).not.toMatch(/Maryam|204817/);
    expect(search.toString()).toBe(`prefill=${token}`);
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/c/q2"));
    const q = sentWith();
    expect(q.patient_id).toBe(PID);
    expect(JSON.stringify(q)).not.toMatch(/Maryam|Abdullahi|204817/);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("can be removed: the focus moves on and the question goes without it", async () => {
    arrive();
    await mount(<Page />);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Remove Maryam Abdullahi from this question",
      }),
    );
    expect(
      screen.queryByRole("group", { name: "About patient" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Age/)).toHaveFocus();
    expect(
      screen.getByText("The patient was removed from this question."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Maryam|204817/);
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    await vi.waitFor(() => expect(createQuery).toHaveBeenCalledTimes(1));
    expect(sentWith()).not.toHaveProperty("patient_id");
  });

  it("isn't offered from an alert without the patient's id", async () => {
    search = new URLSearchParams({
      prefill: stashPrefill(
        askFromAlert(makeAlert(), ALERT_NOW),
        patientFromAlert(makeAlert()),
      ),
    });
    await mount(<Page />);
    expect(
      screen.queryByRole("group", { name: "About patient" }),
    ).not.toBeInTheDocument();
  });

  it("on a 404, says the patient isn't available and asks without them", async () => {
    createQuery.mockRejectedValueOnce(new ApiError(404, "not_found"));
    arrive();
    await mount(<Page />);
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    expect(
      await screen.findByText("This patient isn't available for questions"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't send your question"),
    ).not.toBeInTheDocument();
    // Nothing more was tried with the patient.
    expect(createQuery).toHaveBeenCalledTimes(1);
    const without = screen.getByRole("button", {
      name: "Ask without the patient",
    });
    expect(without).toHaveFocus();
    await userEvent.click(without);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/c/q2"));
    expect(createQuery).toHaveBeenCalledTimes(2);
    expect(sentWith(0).patient_id).toBe(PID);
    expect(sentWith(1)).not.toHaveProperty("patient_id");
    expect(sentWith(1).clinical_question).toBe(sentWith(0).clinical_question);
  });

  it("a 404 then Remove clears the warning; the next Analyse goes without", async () => {
    createQuery.mockRejectedValueOnce(new ApiError(404, "not_found"));
    arrive();
    await mount(<Page />);
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    await screen.findByText("This patient isn't available for questions");
    await userEvent.click(
      screen.getByRole("button", {
        name: "Remove Maryam Abdullahi from this question",
      }),
    );
    expect(
      screen.queryByText("This patient isn't available for questions"),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    await vi.waitFor(() => expect(createQuery).toHaveBeenCalledTimes(2));
    expect(sentWith(1)).not.toHaveProperty("patient_id");
  });

  it("another refusal is the usual error, never the patient's", async () => {
    createQuery.mockRejectedValueOnce(new ApiError(422, "validation_failed"));
    arrive();
    await mount(<Page />);
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    expect(
      await screen.findByText("Couldn't send your question"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This patient isn't available for questions"),
    ).not.toBeInTheDocument();
  });

  it("offline, a linked question isn't saved on this device", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const pushState = vi.spyOn(window.history, "pushState");
    arrive();
    await act(async () => {
      render(
        <Providers auth={{ initialUser: TEST_USER }}>
          <Page />
        </Providers>,
      );
    });
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    expect(
      await screen.findByText("This question needs a connection"),
    ).toBeInTheDocument();
    expect(pushState).not.toHaveBeenCalled();
    expect(createQuery).not.toHaveBeenCalled();
    // The form and the link are still there.
    expect(
      screen.getByRole("group", { name: "About patient" }),
    ).toBeInTheDocument();
  });
});

describe("Home: find a patient by MRN (core 1.29.0)", () => {
  const FOUND = {
    id: "6f1c2a01-5e1d-4c3b-9a7e-000000000001",
    full_name: "Maryam Abdullahi",
    mrn: "204817",
    age: 67,
    sex: "female",
  };
  const box = () =>
    screen.getByRole("textbox", { name: "Find patient by MRN" });
  const findIt = async (mrn: string) => {
    await userEvent.type(box(), mrn);
    await userEvent.click(screen.getByRole("button", { name: "Find" }));
  };
  const open = () =>
    mount(
      <Seeded>
        <Page />
      </Seeded>,
    );
  const sentWith = (n = 0) =>
    (createQuery.mock.calls[n] as unknown as [QueryCreateIn])[0];

  it("a hit fills About patient; the question carries only the id", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const log = vi.spyOn(console, "log");
    lookupPatient.mockResolvedValueOnce(FOUND);
    await open();
    expect(box()).toHaveAttribute("autocomplete", "off");
    await findIt("204817");
    expect(lookupPatient).toHaveBeenCalledWith("204817");
    const about = await screen.findByRole("group", { name: "About patient" });
    expect(about).toHaveTextContent("Maryam Abdullahi");
    expect(about).toHaveTextContent("204817");
    expect(
      screen.getByRole("button", {
        name: "Remove Maryam Abdullahi from this question",
      }),
    ).toHaveFocus();
    expect(
      screen.getByText("The patient was found and linked to this question."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Filled in from a patient alert/)).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Find patient by MRN" }),
    ).not.toBeInTheDocument();
    expect(search.toString()).toBe("");
    expect(document.title).not.toMatch(/Maryam|204817/);
    await userEvent.type(screen.getByLabelText(/^Age/), "67");
    await userEvent.click(screen.getByRole("radio", { name: "Female" }));
    await userEvent.click(screen.getByRole("radio", { name: /Routine/ }));
    await userEvent.type(
      screen.getByLabelText(/^Presenting symptoms/),
      "Weakness{Enter}",
    );
    await userEvent.type(
      screen.getByLabelText(/^Clinical question/),
      "Low potassium: next steps?",
    );
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/c/q2"));
    expect(sentWith().patient_id).toBe(FOUND.id);
    expect(JSON.stringify(sentWith())).not.toMatch(/Maryam|204817/);
    expect(setItem).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("Enter in the box finds; it never sends the question", async () => {
    lookupPatient.mockResolvedValueOnce(FOUND);
    await open();
    await userEvent.type(box(), "204817{Enter}");
    await screen.findByRole("group", { name: "About patient" });
    expect(lookupPatient).toHaveBeenCalledTimes(1);
    expect(createQuery).not.toHaveBeenCalled();
  });

  it("checks the MRN first, without spending a lookup", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Find" }));
    expect(
      screen.getByText(/Enter the patient's full MRN/),
    ).toBeInTheDocument();
    expect(box()).toHaveFocus();
    await findIt("2048%");
    expect(
      screen.getByText(/An MRN has letters and numbers/),
    ).toBeInTheDocument();
    expect(lookupPatient).not.toHaveBeenCalled();
  });

  it.each([
    [404, "not_found", /No active patient with that MRN in your hospital/],
    [
      409,
      "conflict",
      /More than one patient has that MRN; ask your records team/,
    ],
    [429, "rate_limited", /Too many lookups for now; try again later/],
    [503, "not_ready", /Couldn't look up the patient just now/],
    [0, "network", /Couldn't look up the patient just now/],
    [403, "mfa_required", /needs two-step sign-in/],
    [502, "bad_gateway", /Couldn't look up the patient\. Check the MRN/],
  ])(
    "a %i says so in plain words, and keeps the box",
    async (status, code, says) => {
      lookupPatient.mockRejectedValueOnce(new ApiError(status, code));
      await open();
      await findIt("204817");
      expect(await screen.findByText(says)).toBeInTheDocument();
      expect(box()).toHaveFocus();
      expect(box()).toHaveAttribute("aria-invalid", "true");
      expect(
        screen.queryByRole("group", { name: "About patient" }),
      ).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(new RegExp(code));
    },
  );

  it("explains the limits on a 429", async () => {
    lookupPatient.mockRejectedValueOnce(new ApiError(429, "rate_limited"));
    await open();
    await findIt("204817");
    expect(
      await screen.findByText(/5 times a minute and 50 times a day/),
    ).toBeInTheDocument();
  });

  it("Remove brings the box back, empty", async () => {
    lookupPatient.mockResolvedValueOnce(FOUND);
    await open();
    await findIt("204817");
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Remove Maryam Abdullahi from this question",
      }),
    );
    expect(box()).toHaveValue("");
    expect(document.body.textContent).not.toMatch(/Maryam|204817/);
  });

  it("clearing the form forgets the MRN typed and the patient found", async () => {
    lookupPatient.mockResolvedValueOnce(FOUND);
    await open();
    await userEvent.type(box(), "377190");
    await userEvent.click(
      screen.getByRole("button", { name: /Febrile child/ }),
    );
    expect(box()).toHaveValue("");
    await findIt("204817");
    await screen.findByRole("group", { name: "About patient" });
    await userEvent.click(
      screen.getByRole("button", { name: /Febrile child/ }),
    );
    expect(
      screen.queryByRole("group", { name: "About patient" }),
    ).not.toBeInTheDocument();
    expect(box()).toHaveValue("");
    expect(document.body.textContent).not.toMatch(/Maryam|204817|377190/);
  });

  it("an answer that comes after the form was cleared is dropped", async () => {
    let answer!: (v: typeof FOUND) => void;
    lookupPatient.mockReturnValueOnce(
      new Promise((r) => {
        answer = r;
      }),
    );
    await open();
    await findIt("204817");
    await userEvent.click(
      screen.getByRole("button", { name: /Febrile child/ }),
    );
    await act(async () => answer(FOUND));
    expect(
      screen.queryByRole("group", { name: "About patient" }),
    ).not.toBeInTheDocument();
  });
});
