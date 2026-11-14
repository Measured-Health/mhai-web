"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, Suspense, useEffect, useRef, useState } from "react";
import { WaitingToSend } from "@/components/consultation/waiting-to-send";
import { ConsultationForm } from "@/components/form/consultation-form";
import { HowItWorksPanel } from "@/components/form/side-panels";
import { MenuButton } from "@/components/shell/menu-button";
import { TopBar } from "@/components/shell/top-bar";
import { FirstVisit } from "@/components/states/first-visit";
import { DiscardDialog } from "@/components/states/discard-dialog";
import { UnsavedGuard } from "@/components/states/unsaved-guard";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import type { QueryCreateIn } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import { emptyForm, fromQuery, type FormValues } from "@/lib/form-schema";
import {
  clearPrefill,
  readPrefill,
  readPrefillPatient,
} from "@/lib/notifications/ask";
import type { PatientLink } from "@/lib/patient-link";
import { useOutbox } from "@/lib/offline/outbox-context";
import { useSubmitQuery } from "@/lib/queries";
import { titleFor, useSession } from "@/lib/session-store";

// Next keeps this page mounted (hidden) across navigations, so form state is
// reset explicitly: on submit, on Discard, and per `?edit=` target (the key).
//
// Offline, Analyse saves the question on this device and shows "Waiting to
// send" right here at `/?waiting=<localId>` (set with history.pushState, which
// needs no server round trip: a client navigation to /c/… can't load offline).
// Once it syncs, the page moves on to /c/<real id>.
function Home({
  editId,
  waitingId,
  prefillToken,
}: {
  editId: string | null;
  waitingId: string | null;
  prefillToken: string | null;
}) {
  const router = useRouter();
  const session = useSession();
  const submit = useSubmitQuery();
  const outbox = useOutbox();
  const { user, dismissNotice } = useAuth();
  const editing = editId ? session.get(editId) : undefined;
  const waiting = waitingId ? session.get(waitingId) : undefined;
  const real = waitingId ? outbox.resolved[waitingId] : undefined;
  // "Ask MHAI about it": a form waiting in memory, found by its token (R3).
  const prefill = readPrefill(prefillToken);
  const [saveError, setSaveError] = useState(false);
  // Written only in the submit handler.
  const saving = useRef(false);
  useEffect(() => {
    if (real) router.replace(`/c/${real}`);
  }, [real, router]);
  const [started, setStarted] = useState(
    session.items.length > 0 || Boolean(editing) || Boolean(prefill),
  );
  const [initial, setInitial] = useState<FormValues>(() =>
    editing ? fromQuery(editing.query) : (prefill ?? emptyForm),
  );
  const [fromAlert, setFromAlert] = useState(Boolean(prefill) && !editing);
  // The patient the question is about (core 1.22.0): from the alert it
  // started from, or the question being edited. Memory only, never in the
  // address, storage or the offline outbox.
  const [patient, setPatient] = useState<PatientLink | null>(() =>
    editing ? (editing.patient ?? null) : readPrefillPatient(prefillToken),
  );
  // The patient was found by MRN, not brought from the alert.
  const [found, setFound] = useState(false);
  // Offline with a patient linked: the question can't wait on this device.
  const [linkedOffline, setLinkedOffline] = useState(false);
  // Says so to screen readers when the patient is removed.
  const [removed, setRemoved] = useState(false);
  const askWithout = useRef<HTMLButtonElement>(null);
  // An alert's form that arrived while a draft was open, waiting for a yes or no.
  const [asking, setAsking] = useState<{
    values: FormValues;
    patient: PatientLink | null;
  } | null>(null);
  // The last `?prefill=` token looked at (the one from first render counts).
  const [seen, setSeen] = useState(prefillToken);
  const handled = useRef<string | null>(null);
  // Remounts the form for a new starting point (an example, or after Discard).
  const [formKey, setFormKey] = useState(0);
  const [dirty, setDirty] = useState(false);

  const restart = (v: FormValues) => {
    setInitial(v);
    setFormKey((k) => k + 1);
    setDirty(false);
    setStarted(true);
    // Sent, discarded or replaced: the alert's prefill is done with.
    setFromAlert(false);
    setPatient(null);
    setFound(false);
    setLinkedOffline(false);
    setRemoved(false);
    clearPrefill();
  };

  // The page stays mounted, so a later `?prefill=` arrives here, not at mount.
  // Never replace an unsaved draft without asking.
  if (prefillToken && prefillToken !== seen) {
    setSeen(prefillToken);
    const found = readPrefill(prefillToken);
    const link = readPrefillPatient(prefillToken);
    if (found && !editing) {
      if (dirty) setAsking({ values: found, patient: link });
      else {
        setInitial(found);
        setFormKey((k) => k + 1);
        setStarted(true);
        setFromAlert(true);
        setPatient(link);
        setFound(false);
        setLinkedOffline(false);
        setRemoved(false);
      }
    }
  }
  // Once read, the token leaves the address so Back/Forward can't apply it
  // again; with an edit open the alert's form is not wanted at all.
  useEffect(() => {
    if (!prefillToken || handled.current === prefillToken) return;
    handled.current = prefillToken;
    if (editing) clearPrefill();
    const rest = new URLSearchParams();
    if (editId) rest.set("edit", editId);
    if (waitingId) rest.set("waiting", waitingId);
    router.replace(rest.size ? `/?${rest}` : "/");
  }, [prefillToken, editing, editId, waitingId, router]);

  const save = async (q: QueryCreateIn) => {
    const localId = await outbox.queueQuery(q);
    session.add({
      id: localId,
      title: titleFor(q),
      urgency: q.urgency,
      createdAt: Date.now(),
      query: q,
      pending: "waiting",
    });
    dismissNotice();
    restart(emptyForm);
    window.history.pushState(null, "", `/?waiting=${localId}`);
  };

  const keepDraft = () => {
    setAsking(null);
    clearPrefill();
  };
  const replaceDraft = () => {
    // A question on its way out would land on top of the alert's form.
    if (!asking || submit.isPending) return;
    restart(asking.values);
    setFromAlert(true);
    setPatient(asking.patient);
    setFound(false);
    setAsking(null);
  };

  // Core's 404 for a linked patient (unknown, another hospital's, excluded,
  // merged, or EMR off: the same answer for each).
  const sentPatient = submit.variables?.q.patient_id !== undefined;
  const unavailable =
    submit.isError &&
    sentPatient &&
    submit.error instanceof ApiError &&
    submit.error.status === 404;

  // The refusal takes the focus, on its way out (secure-build: a refused
  // field takes the focus).
  useEffect(() => {
    if (unavailable) askWithout.current?.focus();
  }, [unavailable]);

  const clearPatient = () => {
    setPatient(null);
    setFound(false);
    setLinkedOffline(false);
    setRemoved(true);
    if (unavailable) submit.reset();
  };

  const send = (q: QueryCreateIn, link: PatientLink | null) =>
    submit.mutate(link ? { ...q, patient_id: link.id } : q, {
      onSuccess: ({ query_id }) =>
        // Leaving on purpose: no prompt. Coming back finds a fresh
        // form; one transition so it never flashes empty first.
        startTransition(() => {
          // Kept in memory with the history item, for Edit question.
          if (link) session.update(query_id, { patient: link });
          // A new consultation started: the sign-out notice goes.
          dismissNotice();
          restart(emptyForm);
          submit.reset();
          router.push(`/c/${query_id}`);
        }),
    });

  // The question as typed, without the patient: "Ask without the patient".
  const askWithoutPatient = () => {
    const sent = submit.variables?.q;
    if (!sent || submit.isPending) return;
    const rest: QueryCreateIn = { ...sent };
    delete rest.patient_id;
    clearPatient();
    send(rest, null);
  };

  if (real) return null; // synced: on the way to /c/<real id>
  if (waiting?.pending)
    return (
      <>
        <TopBar
          title={waiting.title}
          urgency={waiting.urgency}
          leading={<MenuButton />}
        />
        <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
          <WaitingToSend
            item={waiting}
            onEdit={() =>
              window.history.pushState(null, "", `/?edit=${waiting.id}`)
            }
            onDeleted={() => window.history.replaceState(null, "", "/")}
          />
        </div>
      </>
    );

  return (
    <>
      <TopBar
        title="New consultation"
        sub={dirty ? "Draft · not submitted" : undefined}
        leading={<MenuButton />}
      />
      <div
        className={
          started
            ? "grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_330px]"
            : "flex min-h-0 flex-1"
        }
      >
        <div className="min-w-0 flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
          {!started ? (
            <FirstVisit
              name={user?.displayName ?? ""}
              onStart={() => setStarted(true)}
              onExample={restart}
            />
          ) : (
            <div className="mx-auto max-w-[700px]">
              <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
                New consultation
              </p>
              <h2 className="font-display text-[40px] font-black leading-none">
                What&apos;s going on with your patient?
              </h2>
              <p className="mb-5 mt-1.5 text-[14.5px] text-ink-2">
                Three quick sections. The more detail you give, the better the
                answer.
              </p>
              {fromAlert && (
                <p className="mb-4 rounded-xl bg-mint-wash px-3.5 py-2.5 text-[13px] text-mint-deep">
                  {patient && !found
                    ? "Filled in from a patient alert and linked to the patient. Their name and record number weren't copied into the question. Check the details before you analyse."
                    : "Filled in from a patient alert. The patient's name and record number weren't copied. Check the details before you analyse."}
                </p>
              )}
              <p role="status" className="sr-only">
                {removed
                  ? "The patient was removed from this question."
                  : found && patient
                    ? "The patient was found and linked to this question."
                    : ""}
              </p>
              {unavailable && (
                <div className="mb-4">
                  <Banner
                    tone="warn"
                    title="This patient isn't available for questions"
                  >
                    <p>You can still ask without linking a patient.</p>
                    <Button
                      ref={askWithout}
                      type="button"
                      size="sm"
                      variant="soft"
                      className="mt-2"
                      disabled={submit.isPending}
                      onClick={askWithoutPatient}
                    >
                      Ask without the patient
                    </Button>
                  </Banner>
                </div>
              )}
              {linkedOffline && patient && (
                <div className="mb-4">
                  <Banner tone="warn" title="This question needs a connection">
                    A question linked to a patient can&apos;t wait on this
                    device. Send it when you&apos;re back online, or remove the
                    patient to save it now.
                  </Banner>
                </div>
              )}
              {saveError && (
                <div className="mb-4">
                  <Banner tone="bad" title="Couldn't save your question">
                    You&apos;re offline and this device can&apos;t keep it. Your
                    answers are still here. Try again when you&apos;re back
                    online.
                  </Banner>
                </div>
              )}
              {submit.isError && !unavailable && (
                <div className="mb-4">
                  <Banner tone="bad" title="Couldn't send your question">
                    Your answers are still here. Check your connection and try
                    again.
                  </Banner>
                </div>
              )}
              <ConsultationForm
                key={formKey}
                initial={initial}
                patient={patient}
                onClearPatient={clearPatient}
                onFindPatient={(link) => {
                  // Found by MRN (core 1.29.0): memory only, like a link
                  // from an alert.
                  setPatient(link);
                  setFound(true);
                  setRemoved(false);
                  setLinkedOffline(false);
                  if (unavailable) submit.reset();
                }}
                onDirtyChange={setDirty}
                onSubmit={async (q) => {
                  if (submit.isPending || saving.current) return;
                  saving.current = true;
                  try {
                    // An edited offline question replaces the saved one.
                    if (editing?.pending) {
                      await outbox.discard(editing.id);
                      session.remove(editing.id);
                    }
                    if (!navigator.onLine) {
                      setSaveError(false);
                      // A linked patient never waits on this device.
                      if (patient) {
                        setLinkedOffline(true);
                        return;
                      }
                      await save(q);
                      return;
                    }
                  } catch {
                    setSaveError(true);
                    return;
                  } finally {
                    saving.current = false;
                  }
                  setLinkedOffline(false);
                  send(q, patient);
                }}
              />
            </div>
          )}
        </div>
        {started && <HowItWorksPanel onExample={restart} />}
      </div>
      <DiscardDialog
        open={asking !== null}
        title="Replace your draft?"
        body="Replace your draft with the details from the alert? What you typed will be lost."
        keepLabel="Keep my draft"
        discardLabel="Replace"
        onKeep={keepDraft}
        onDiscard={replaceDraft}
        blocked={
          submit.isPending
            ? "Your question is being sent. Wait for it to finish."
            : undefined
        }
      />
      <UnsavedGuard
        dirty={dirty && !submit.isPending}
        onDiscard={() => restart(emptyForm)}
      />
    </>
  );
}

function HomeRoute() {
  // `?edit=<id>` comes from "Edit question" on a result that couldn't complete.
  // `?waiting=<localId>`: a question just saved offline (see Home).
  // `?prefill=<token>`: "Ask MHAI about it" on a patient alert (Plan 5a).
  const params = useSearchParams();
  const editId = params.get("edit");
  const waitingId = params.get("waiting");
  const prefillToken = params.get("prefill");
  return (
    <Home
      key={`${editId ?? ""}|${waitingId ?? ""}`}
      editId={editId}
      waitingId={waitingId}
      prefillToken={prefillToken}
    />
  );
}

export default function Page() {
  // useSearchParams sits inside a Suspense boundary.
  return (
    <Suspense>
      <HomeRoute />
    </Suspense>
  );
}
