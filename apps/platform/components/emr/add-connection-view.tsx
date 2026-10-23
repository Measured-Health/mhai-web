"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import {
  useAddConnection,
  useConnectableHospitals,
  useConnectorTypes,
} from "@/lib/queries/emr";
import { useHospital } from "@/lib/queries/hospitals";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { Banner } from "@mhai/ui/banner";
import { useToast } from "@mhai/ui/toast";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { addInput, ConnectionForm } from "./connection-form";

const OPAQUE_ID = /^[A-Za-z0-9_-]+$/;
const linkClass =
  "inline-flex min-h-11 items-center font-semibold text-mint-deep underline underline-offset-2 sm:min-h-9";

/** Add a connection to a hospital: admins only, never for a removed one. */
export function AddConnectionView() {
  const { user } = useAuth();
  const wanted = useSearchParams().get("hospital") ?? "";
  const hospitalId = OPAQUE_ID.test(wanted) ? wanted : "";
  return (
    <>
      <TopBar
        title="Add a connection"
        sub="How MHAI reads a hospital's records"
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto max-w-[640px]">
          {!isPlatformAdmin(user) ? (
            <Banner tone="warn" title="Your account can only view this.">
              <Link href="/hospitals" className={linkClass}>
                Back to Hospitals
              </Link>
            </Banner>
          ) : hospitalId ? (
            <ForHospital id={hospitalId} />
          ) : (
            <Picker />
          )}
        </div>
      </div>
    </>
  );
}

/** Which hospital to add it to, when the link didn't say. */
function Picker({ note }: { note?: string }) {
  const q = useConnectableHospitals();
  return (
    <section aria-labelledby="pick-h" className="card-v3 px-[22px] py-5">
      <h2 id="pick-h" className="mb-1 text-[15px] font-semibold">
        Choose a hospital
      </h2>
      {note && <p className="mb-2 text-[13.5px] text-ink-2">{note}</p>}
      {q.isError ? (
        <CouldntLoad what="hospitals" onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading label="Loading hospitals" />
      ) : q.data.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">There are no hospitals yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((h) => (
            <li key={h.id}>
              <Link
                href={`/connections/new?hospital=${encodeURIComponent(h.id)}`}
                className="flex min-h-11 items-center justify-between gap-3 py-2 text-[14px] font-semibold hover:underline"
              >
                <span>{h.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ForHospital({ id }: { id: string }) {
  const h = useHospital(id);
  if (h.isError) {
    const w = platformError(h.error);
    return w.gone ? (
      <Picker note="That hospital wasn't found. Choose one below." />
    ) : (
      <CouldntLoad what="this hospital" onRetry={() => void h.refetch()} />
    );
  }
  if (!h.data) return <Loading label="Loading hospital" />;
  if (h.data.status === "removed")
    return <Picker note="That hospital has been removed. Choose another." />;
  return <AddForm hospitalId={id} hospitalName={h.data.name} />;
}

function AddForm({
  hospitalId,
  hospitalName,
}: {
  hospitalId: string;
  hospitalName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const types = useConnectorTypes();
  const add = useStepUpCall(useAddConnection(hospitalId));
  const [saved, setSaved] = useState(0);

  if (types.isError && !types.data)
    return (
      <CouldntLoad
        what="the connection types"
        onRetry={() => void types.refetch()}
      />
    );
  if (!types.data) return <Loading label="Loading connection types" />;
  return (
    <div className="card-v3 px-[22px] py-5">
      <p className="mb-4 text-[13.5px] text-ink-2">
        For <strong className="font-semibold">{hospitalName}</strong>
      </p>
      <ConnectionForm
        mode="add"
        types={types.data}
        hospitalName={hospitalName}
        savedCount={saved}
        busy={add.busy}
        error={add.error}
        onCloseDialog={add.clear}
        onSend={(draft, code) =>
          add.run(
            { ...addInput(draft), ...code },
            {
              onSuccess: (c) => {
                setSaved((n) => n + 1);
                toast.show({
                  title: "Connection added. Test it next.",
                  tone: "ok",
                  live: "polite",
                });
                router.push(`/connections/${c.id}`);
              },
            },
          )
        }
        cancel={
          <Link
            href={`/hospitals/${encodeURIComponent(hospitalId)}`}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-5 text-sm font-semibold text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep"
          >
            Cancel
          </Link>
        }
      />
    </div>
  );
}
