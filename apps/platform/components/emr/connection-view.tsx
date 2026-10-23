"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { StepUp } from "@/lib/api/contract";
import type { EmrConnection } from "@/lib/api/emr-contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { syncErrorLabel, syncLine } from "@/lib/emr/labels";
import { canSwitchOn, connectionState } from "@/lib/emr/state";
import { whenLabel } from "@/lib/emr/when";
import { platformError } from "@/lib/errors";
import {
  useConnection,
  useConnectorTypes,
  useSetEnabled,
  useTestConnection,
  useUpdateConnection,
} from "@/lib/queries/emr";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { RecentActions } from "../hospitals/recent-actions";
import { Section } from "../hospitals/section";
import { codeOf, StepUpDialog } from "../hospitals/step-up-dialog";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { ConnectionForm, patchInput } from "./connection-form";
import { CredentialRow } from "./credential-row";
import { StateChip } from "./state-chip";
import { SyncErrors } from "./sync-errors";

const TEST_FIRST = "Test the saved settings first.";
const ON_INTRO = "MHAI will start reading new records from this connection.";
const OFF_INTRO =
  "MHAI will stop reading records from this connection. Alerts from it stop until it is switched on again.";

/** "Last test: Worked · 20 Oct 2026, 10:42" and its other two readings. */
function testLine(t: EmrConnection["last_test"]): string {
  if (!t) return "Not tested yet.";
  return t.ok
    ? `Last test: Worked · ${whenLabel(t.at)}`
    : `Didn't work: ${t.code ? syncErrorLabel(t.code) : "The test did not pass."}`;
}

/**
 * One record connection: its status, settings, last day's problems and
 * recent actions. Platform admins test, switch and edit it; auditors read.
 */
export function ConnectionView({ id }: { id: string }) {
  const { user } = useAuth();
  const q = useConnection(id);
  const types = useConnectorTypes();
  const c = q.data;
  const gone = q.isError && platformError(q.error).gone;
  const admin = isPlatformAdmin(user);

  return (
    <>
      <TopBar
        title={gone ? "Connection" : (c?.source_label ?? "Connection")}
        sub={
          c && !gone ? (
            <Link
              href={`/hospitals/${encodeURIComponent(c.hospital.id)}`}
              className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-white"
            >
              {c.hospital.name}
            </Link>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto flex max-w-[880px] flex-col gap-4">
          {gone ? (
            <Banner tone="warn" title="This was removed or no longer exists.">
              <Link
                href="/hospitals"
                className="mt-1 inline-flex min-h-11 items-center font-semibold underline sm:min-h-0"
              >
                Back to Hospitals
              </Link>
            </Banner>
          ) : q.isError && !c ? (
            <CouldntLoad
              what="this connection"
              onRetry={() => void q.refetch()}
            />
          ) : !c ? (
            <Loading label="Loading connection" />
          ) : (
            <Body
              c={c}
              admin={admin}
              types={types}
              onReload={() => void q.refetch()}
            />
          )}
        </div>
      </div>
    </>
  );
}

function Body({
  c,
  admin,
  types,
  onReload,
}: {
  c: EmrConnection;
  admin: boolean;
  types: ReturnType<typeof useConnectorTypes>;
  onReload(): void;
}) {
  const toast = useToast();
  const net = useNeedsConnection("conn-offline");
  const [now] = useState(() => Date.now());
  const statusRef = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState<"on" | "off" | null>(null);
  const [editing, setEditing] = useState(false);
  const setEnabled = useStepUpCall(useSetEnabled(c.id));
  const update = useStepUpCall(useUpdateConnection(c.id));
  const test = useTestConnection(c.id);
  const state = connectionState(c);
  const type = types.data?.find((t) => t.id === c.type) ?? null;
  const focusStatus = () => setTimeout(() => statusRef.current?.focus(), 0);

  /** Someone else changed it, or it is no longer ready: say so and reload. */
  const stale = (e: Error): boolean => {
    const w = platformError(e);
    if (!w.stale && !w.gone) return false;
    setAsking(null);
    setEditing(false);
    toast.show({ title: w.title, body: w.body, live: "assertive" });
    onReload();
    return true;
  };

  const runTest = () =>
    test.mutate(undefined, {
      onSuccess: (r) => {
        toast.show(
          r.last_test?.ok
            ? { title: "Test passed.", tone: "ok", live: "polite" }
            : {
                title: `Test failed: ${r.last_test?.code ? syncErrorLabel(r.last_test.code) : "The test did not pass."}`,
                live: "assertive",
              },
        );
        focusStatus();
      },
      onError: (e) =>
        toast.show({ title: platformError(e).title, live: "assertive" }),
    });

  const closeAsk = () => {
    setAsking(null);
    setEnabled.clear();
  };
  const confirmSwitch = (code: StepUp) => {
    if (!asking) return;
    const on = asking === "on";
    setEnabled.run(
      { enabled: on, version: c.version, ...code },
      {
        onSuccess: () => {
          setAsking(null);
          toast.show({
            title: on ? "Switched on." : "Switched off.",
            tone: "ok",
            live: "polite",
          });
          focusStatus();
        },
        onError: stale,
      },
    );
  };

  const switchOn = !c.enabled;
  const blocked = switchOn && !canSwitchOn(c);
  const label = c.source_label;

  return (
    <>
      <Section title="Status">
        <div
          ref={statusRef}
          role="status"
          aria-label="Connection status"
          tabIndex={-1}
          className="flex flex-col gap-1.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mint-deep"
        >
          <div>
            <StateChip state={state} />
          </div>
          <p className="text-[14px]">{syncLine(c, now)}</p>
          <p className="text-[13.5px] text-ink-2">{testLine(c.last_test)}</p>
        </div>
        {admin && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              {...net.props}
              disabled={net.offline || test.isPending}
              onClick={runTest}
            >
              {test.isPending ? "Testing…" : "Test connection"}
            </Button>
            <Button
              size="sm"
              variant={switchOn ? "primary" : "danger"}
              {...net.props}
              disabled={net.offline || blocked}
              aria-describedby={
                net.offline
                  ? "conn-offline"
                  : blocked
                    ? "conn-test-first"
                    : undefined
              }
              onClick={() => setAsking(switchOn ? "on" : "off")}
            >
              {switchOn ? "Switch on" : "Switch off"}
            </Button>
          </div>
        )}
        {admin && blocked && !net.offline && (
          <p id="conn-test-first" className="mt-2 text-[13px] text-ink-3">
            {TEST_FIRST}
          </p>
        )}
        {admin && <OfflineNote id="conn-offline" />}
        {admin && (
          <StepUpDialog
            open={asking !== null}
            title={`Switch ${asking === "off" ? "off" : "on"} ${label}?`}
            intro={<p>{asking === "off" ? OFF_INTRO : ON_INTRO}</p>}
            confirmLabel={asking === "off" ? "Switch off" : "Switch on"}
            tone={asking === "off" ? "danger" : "primary"}
            busy={setEnabled.busy}
            error={setEnabled.error}
            onClose={closeAsk}
            onConfirm={(input) => confirmSwitch(codeOf(input))}
          />
        )}
      </Section>

      <Section
        title="Settings"
        action={
          admin && !editing ? (
            <Button
              variant="ghost"
              size="sm"
              {...net.props}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          ) : undefined
        }
      >
        {!type ? (
          types.isError ? (
            <CouldntLoad
              what="the connection types"
              onRetry={() => void types.refetch()}
            />
          ) : (
            <Loading label="Loading settings" />
          )
        ) : editing && admin ? (
          <ConnectionForm
            mode="edit"
            types={types.data ?? []}
            connection={c}
            busy={update.busy}
            error={update.error}
            onCloseDialog={update.clear}
            onNothingChanged={() => setEditing(false)}
            onSend={(draft, code) =>
              update.run(
                { ...patchInput(draft, c), version: c.version, ...code },
                {
                  onSuccess: () => {
                    setEditing(false);
                    toast.show({ title: "Saved.", tone: "ok", live: "polite" });
                    focusStatus();
                  },
                  onError: stale,
                },
              )
            }
            cancel={
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <dl className="flex flex-col gap-3">
              <Row term="Type">{`${type.label} · ${type.summary}`}</Row>
              <Row term="Base address">{c.base_url}</Row>
              {type.fields
                .filter((f) => f.kind === "text")
                .map((f) => (
                  <Row key={f.key} term={f.label}>
                    {c.settings[f.key] || "Not set"}
                  </Row>
                ))}
            </dl>
            {type.fields
              .filter((f) => f.kind === "secret")
              .map((f) => (
                <CredentialRow
                  key={f.key}
                  label={f.label}
                  setAt={
                    c.credentials.find((x) => x.key === f.key)?.set_at ?? null
                  }
                />
              ))}
          </div>
        )}
      </Section>

      <Section title="Problems in the last 24 hours">
        <SyncErrors errors={c.errors} />
      </Section>

      <RecentActions hospitalId={c.hospital.id} />
    </>
  );
}

function Row({ term, children }: { term: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-[12.5px] text-ink-3">{term}</dt>
      <dd className="min-w-0 break-words text-[14px]">{children}</dd>
    </div>
  );
}
