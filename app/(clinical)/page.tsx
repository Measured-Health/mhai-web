"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, Suspense, useState } from "react";
import { ConsultationForm } from "@/components/form/consultation-form";
import { MenuButton } from "@/components/shell/menu-button";
import { DEMO_USER } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { FirstVisit } from "@/components/states/first-visit";
import { useSignedOutNotice } from "@/components/states/session-timeout";
import { SignedOutNotice } from "@/components/states/signed-out-notice";
import { UnsavedGuard } from "@/components/states/unsaved-guard";
import { Banner } from "@/components/ui/banner";
import { emptyForm, fromQuery, type FormValues } from "@/lib/form-schema";
import { useSubmitQuery } from "@/lib/queries";
import { useSession } from "@/lib/session-store";

// Next keeps this page mounted (hidden) across navigations, so form state is
// reset explicitly: on submit, on Discard, and per `?edit=` target (the key).
function Home({ editId }: { editId: string | null }) {
  const router = useRouter();
  const session = useSession();
  const submit = useSubmitQuery();
  const signedOut = useSignedOutNotice();
  const editing = editId ? session.get(editId) : undefined;
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

  return (
    <>
      <TopBar
        title="New consultation"
        sub={dirty ? "Draft · not submitted" : undefined}
        leading={<MenuButton />}
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <SignedOutNotice />
        {!started ? (
          <FirstVisit
            name={DEMO_USER.name}
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
              onSubmit={(q) => {
                if (submit.isPending) return;
                submit.mutate(q, {
                  onSuccess: ({ query_id }) =>
                    // Leaving on purpose: no prompt. Coming back finds a fresh
                    // form; one transition so it never flashes empty first.
                    startTransition(() => {
                      // A new consultation started: the sign-out notice goes.
                      signedOut.dismiss();
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
  const editId = useSearchParams().get("edit");
  return <Home key={editId ?? ""} editId={editId} />;
}

export default function Page() {
  // useSearchParams needs a Suspense boundary with cacheComponents.
  return (
    <Suspense>
      <HomeRoute />
    </Suspense>
  );
}
