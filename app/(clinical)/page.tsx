"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, Suspense, useEffect, useRef, useState } from "react";
import { WaitingToSend } from "@/components/consultation/waiting-to-send";
import { ConsultationForm } from "@/components/form/consultation-form";
import { MenuButton } from "@/components/shell/menu-button";
import { TopBar } from "@/components/shell/top-bar";
import { FirstVisit } from "@/components/states/first-visit";
import { UnsavedGuard } from "@/components/states/unsaved-guard";
import { Banner } from "@/components/ui/banner";
import { useAuth } from "@/lib/auth/auth-context";
import type { QueryCreateIn } from "@/lib/api/contract";
import { emptyForm, fromQuery, type FormValues } from "@/lib/form-schema";
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
}: {
  editId: string | null;
  waitingId: string | null;
}) {
  const router = useRouter();
  const session = useSession();
  const submit = useSubmitQuery();
  const outbox = useOutbox();
  const { user, dismissNotice } = useAuth();
  const editing = editId ? session.get(editId) : undefined;
  const waiting = waitingId ? session.get(waitingId) : undefined;
  const real = waitingId ? outbox.resolved[waitingId] : undefined;
  const [saveError, setSaveError] = useState(false);
  // Written only in the submit handler.
  const saving = useRef(false);
  useEffect(() => {
    if (real) router.replace(`/c/${real}`);
  }, [real, router]);
  const [started, setStarted] = useState(
    session.items.length > 0 || Boolean(editing),
  );
  const [initial, setInitial] = useState<FormValues>(() =>
    editing ? fromQuery(editing.query) : emptyForm,
  );
  // Remounts the form for a new starting point (an example, or after Discard).
  const [formKey, setFormKey] = useState(0);
  const [dirty, setDirty] = useState(false);

  const restart = (v: FormValues) => {
    setInitial(v);
    setFormKey((k) => k + 1);
    setDirty(false);
    setStarted(true);
  };

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
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
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
            {saveError && (
              <div className="mb-4">
                <Banner tone="bad" title="Couldn't save your question">
                  You&apos;re offline and this device can&apos;t keep it. Your
                  answers are still here. Try again when you&apos;re back
                  online.
                </Banner>
              </div>
            )}
            {submit.isError && (
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
                    await save(q);
                    return;
                  }
                } catch {
                  setSaveError(true);
                  return;
                } finally {
                  saving.current = false;
                }
                submit.mutate(q, {
                  onSuccess: ({ query_id }) =>
                    // Leaving on purpose: no prompt. Coming back finds a fresh
                    // form; one transition so it never flashes empty first.
                    startTransition(() => {
                      // A new consultation started: the sign-out notice goes.
                      dismissNotice();
                      restart(emptyForm);
                      submit.reset();
                      router.push(`/c/${query_id}`);
                    }),
                });
              }}
            />
          </div>
        )}
      </div>
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
  const params = useSearchParams();
  const editId = params.get("edit");
  const waitingId = params.get("waiting");
  return (
    <Home
      key={`${editId ?? ""}|${waitingId ?? ""}`}
      editId={editId}
      waitingId={waitingId}
    />
  );
}

export default function Page() {
  // useSearchParams needs a Suspense boundary with cacheComponents.
  return (
    <Suspense>
      <HomeRoute />
    </Suspense>
  );
}
