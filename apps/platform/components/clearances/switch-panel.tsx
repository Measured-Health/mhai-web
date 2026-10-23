"use client";
import {
  ChevronDown,
  Eye,
  EyeOff,
  FileCheck2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@mhai/api-client/errors";
import { dayLabel, POSITION_LABEL, POSITION_ORDER } from "@mhai/ui/clearances";
import {
  SIGNOFF_KINDS,
  type NamedAccessOut,
  type NamedPosition,
  type Signoffs,
  type SwitchChange,
  type SwitchRequest,
  type SwitchState,
} from "@/lib/api/clearances-contract";
import type { Person } from "@/lib/api/contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import {
  instantDay,
  lowerOptions,
  positionLine,
  raiseOptions,
  requestLine,
} from "@/lib/clearances/switch";
import { platformError } from "@/lib/errors";
import { dayMonthLabel } from "@/lib/format";
import {
  useApproveNamedAccess,
  useCancelNamedAccess,
  useNamedAccessState,
  useRefreshNamedAccess,
} from "@/lib/queries/clearances";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";
import { Section } from "../hospitals/section";
import {
  codeOf,
  StepUpDialog,
  type StepUpInput,
} from "../hospitals/step-up-dialog";
import { TwoPersonActions, WAITING } from "../shared/two-person";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import {
  scopeWords,
  SWITCH_ERRORS,
  SWITCH_REFUSED,
  SwitchLowerDialog,
  SwitchRequestDialog,
} from "./switch-request-dialog";

const ICON: Record<NamedPosition, LucideIcon> = {
  off: EyeOff,
  letters_only: FileCheck2,
  on: Eye,
};

/** A position: always an icon and its word, never colour alone. */
export function PositionWords({
  p,
  className,
}: {
  p: NamedPosition;
  className?: string;
}) {
  const I = ICON[p];
  return (
    <span
      data-position={p}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <I aria-hidden className="size-4 shrink-0" />
      <span>{POSITION_LABEL[p]}</span>
    </span>
  );
}

const rank = (p: NamedPosition) => POSITION_ORDER.indexOf(p);

const SIGNOFF_LABEL: Record<keyof Signoffs, string> = {
  clinical: "Clinical",
  privacy: "Privacy",
  legal: "Legal",
};

/** A sign-off's day as "1 Feb 2027", or the text as sent if it isn't one. */
function signoffDay(ymd: string): string {
  try {
    return dayLabel(ymd);
  } catch {
    return ymd;
  }
}

/** "Clinical: Dr. A. Musa · 1 Feb 2027 · CS-014", one line per sign-off. */
function SignoffLines({
  signoffs,
  className,
}: {
  signoffs: Signoffs;
  className?: string;
}) {
  return (
    <div className={className}>
      {SIGNOFF_KINDS.map((k) => (
        <p key={k} className="[overflow-wrap:anywhere]">
          {SIGNOFF_LABEL[k]}: {signoffs[k].by} · {signoffDay(signoffs[k].at)} ·{" "}
          {signoffs[k].ref}
        </p>
      ))}
    </div>
  );
}

/** What the person is doing: the scope and the version they saw. */
type Asking =
  | {
      kind: "raise" | "lower";
      hospital: Person | null;
      current: NamedPosition;
      ceiling: NamedPosition;
      version: number;
    }
  | {
      kind: "approve";
      hospital: Person | null;
      request: SwitchRequest;
      version: number;
    };

/**
 * The named-access switch: the global position and each hospital's, with
 * who changed them. Platform admins turn a switch up (a request a different
 * admin approves, with all three sign-offs), turn it down (at once), and
 * approve or cancel a waiting request; auditors see the lines only. Who
 * may approve is the server's `requested_by_you`. After any answer the
 * focus goes to the panel's status line, which says what happened.
 */
export function SwitchPanel() {
  const named = useNamedAccessState();
  // Loading, offline and Couldn't load are the page's: it says them once.
  return named.data ? <Panel data={named.data} /> : null;
}

function Panel({ data }: { data: NamedAccessOut }) {
  const { user } = useAuth();
  const canAct = isPlatformAdmin(user);
  const offlineId = useId();
  const net = useNeedsConnection(offlineId);
  const refresh = useRefreshNamedAccess();
  const approve = useStepUpCall(useApproveNamedAccess());
  const cancel = useCancelNamedAccess();
  const [asking, setAsking] = useState<Asking | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const historyId = useId();

  // After acting, the button that opened the dialog may be gone: the focus
  // goes to the status line, never the page.
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [acted, setActed] = useState(0);
  useEffect(() => {
    if (acted) statusRef.current?.focus();
  }, [acted]);

  const after = (words: string) => {
    setAsking(null);
    approve.clear();
    setOutcome(words);
    setActed((n) => n + 1);
  };
  /** Not as the person saw it, or not theirs: close, say why, reload. */
  const refused = (e: unknown) => {
    after(platformError(e, SWITCH_ERRORS).title);
    void refresh();
  };
  const nowIs = (hospital: Person | null, p: NamedPosition) =>
    `Named access for ${scopeWords(hospital)} is now ${POSITION_LABEL[p]}`;

  const begin = (a: Asking) => {
    setOutcome(null);
    setAsking(a);
  };
  const closeAsking = () => {
    setAsking(null);
    approve.clear();
  };

  const confirmApprove = (input: StepUpInput) => {
    if (asking?.kind !== "approve") return;
    const { request: r, hospital, version } = asking;
    approve.run(
      { id: r.id, version, ...codeOf(input) },
      {
        onSuccess: () => after(nowIs(hospital, r.position)),
        onError: (e) => {
          if (!(e instanceof ApiError && SWITCH_REFUSED.includes(e.code)))
            return false;
          refused(e);
          return true;
        },
      },
    );
  };
  const doCancel = (r: SwitchRequest, version: number) => {
    setOutcome(null);
    cancel.mutate(
      { id: r.id, version },
      {
        onSuccess: () => after("Request cancelled"),
        onError: (e) => refused(e),
      },
    );
  };

  /** One scope: its position, its request and, for admins, its buttons. */
  const scope = (
    s: SwitchState,
    hospital: Person | null,
    ceiling: NamedPosition,
  ) => {
    const r = s.request;
    const up = !r && raiseOptions(s.position, ceiling).length > 0;
    const down = lowerOptions(s.position).length > 0;
    return (
      <>
        {r && (
          <div className="mt-2">
            <TwoPersonActions
              request={r}
              line={`${requestLine({ ...r, requested_by_you: false })} · lapses ${dayMonthLabel(r.expires_at)}`}
              canAct={canAct}
              approveLabel="Approve"
              onApprove={() =>
                begin({
                  kind: "approve",
                  hospital,
                  request: r,
                  version: s.version,
                })
              }
              onCancel={() => doCancel(r, s.version)}
              busy={cancel.isPending && cancel.variables?.v.id === r.id}
              offlineProps={net.props}
            />
          </div>
        )}
        {canAct && (up || down) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {up && (
              <Button
                size="sm"
                variant="ghost"
                {...net.props}
                onClick={() =>
                  begin({
                    kind: "raise",
                    hospital,
                    current: s.position,
                    ceiling,
                    version: s.version,
                  })
                }
              >
                Turn up
              </Button>
            )}
            {down && (
              <Button
                size="sm"
                variant="ghost"
                {...net.props}
                onClick={() =>
                  begin({
                    kind: "lower",
                    hospital,
                    current: s.position,
                    ceiling,
                    version: s.version,
                  })
                }
              >
                Turn down
              </Button>
            )}
          </div>
        )}
      </>
    );
  };

  const g = data.global;
  const line = "text-[13.5px] text-ink-2 [overflow-wrap:anywhere]";
  const globalId = `${historyId}-global`;
  const a = asking;
  const approving = a?.kind === "approve" ? a : null;

  return (
    <Section title="Named access">
      <p
        ref={statusRef}
        role="status"
        tabIndex={-1}
        className={cn(
          "rounded-lg text-[13.5px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mint-deep",
          outcome ? "mb-3" : "sr-only",
        )}
      >
        {outcome}
      </p>

      <div role="group" aria-labelledby={globalId}>
        <h3 id={globalId} className="text-[13px] font-semibold text-ink-3">
          Every hospital
        </h3>
        <PositionWords
          p={g.position}
          className="mt-1 text-[18px] font-semibold"
        />
        <p className={`${line} mt-1`}>{positionLine(g)}</p>
        {scope(g, null, "on")}
      </div>

      <h3 className="mb-2 mt-5 text-[13px] font-semibold text-ink-3">
        By hospital
      </h3>
      <ul className="flex flex-col gap-2.5">
        {data.hospitals.map((h) => (
          <HospitalRow key={h.hospital.id} h={h} line={line}>
            {scope(h, h.hospital, g.position)}
          </HospitalRow>
        ))}
      </ul>
      {canAct && <OfflineNote id={offlineId} />}

      <div className="mt-4">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={showHistory}
          aria-controls={showHistory ? `${historyId}-list` : undefined}
          onClick={() => setShowHistory((v) => !v)}
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 transition-transform",
              showHistory && "rotate-180",
            )}
          />
          History
        </Button>
        {showHistory && (
          <History id={`${historyId}-list`} data={data} line={line} />
        )}
      </div>

      {canAct && (
        <>
          <SwitchRequestDialog
            open={a?.kind === "raise"}
            scope={{ hospital: a?.hospital ?? null }}
            current={a?.kind === "raise" ? a.current : "off"}
            ceiling={a?.kind === "raise" ? a.ceiling : "off"}
            today={data.today}
            version={a?.version ?? 0}
            onClose={closeAsking}
            onDone={(_, p) =>
              after(
                `Asked to turn named access for ${scopeWords(a?.hospital ?? null)} ${POSITION_LABEL[p]}. ${WAITING}`,
              )
            }
            onRefused={refused}
          />
          <SwitchLowerDialog
            open={a?.kind === "lower"}
            scope={{ hospital: a?.hospital ?? null }}
            current={a?.kind === "lower" ? a.current : "off"}
            version={a?.version ?? 0}
            onClose={closeAsking}
            onDone={(_, p) => after(nowIs(a?.hospital ?? null, p))}
            onRefused={refused}
          />
          <StepUpDialog
            open={!!approving}
            title={
              approving
                ? `Approve named access for ${scopeWords(approving.hospital)}: ${POSITION_LABEL[approving.request.position]}?`
                : "Approve"
            }
            intro={
              approving && (
                <>
                  <p>{requestLine(approving.request)}</p>
                  <SignoffLines
                    signoffs={approving.request.signoffs}
                    className="mt-2"
                  />
                  <p className="mt-2">It takes effect once you approve.</p>
                </>
              )
            }
            confirmLabel="Approve"
            tone="primary"
            busy={approve.busy}
            error={approve.error}
            onClose={closeAsking}
            onConfirm={confirmApprove}
          />
        </>
      )}
    </Section>
  );
}

function HospitalRow({
  h,
  line,
  children,
}: {
  h: NamedAccessOut["hospitals"][number];
  line: string;
  children: ReactNode;
}) {
  const id = useId();
  const limited = rank(h.effective) < rank(h.position);
  return (
    <li className="rounded-xl border border-line px-4 py-3">
      <div role="group" aria-labelledby={id}>
        <p
          id={id}
          className="text-[14px] font-semibold [overflow-wrap:anywhere]"
        >
          {h.hospital.name}
        </p>
        <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px]">
          <div className="flex items-center gap-1.5">
            <dt className="text-ink-3">Own switch</dt>
            <dd>
              <PositionWords p={h.position} />
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-ink-3">In effect</dt>
            <dd>
              <PositionWords p={h.effective} />
            </dd>
          </div>
        </dl>
        {limited && (
          <p className={`${line} mt-1`}>Limited by the global switch</p>
        )}
        {h.history.length > 0 && (
          <p className={`${line} mt-1 text-ink-3`}>{positionLine(h)}</p>
        )}
        {children}
      </div>
    </li>
  );
}

/** Every change, global and per hospital, newest first, with its sign-offs. */
function History({
  id,
  data,
  line,
}: {
  id: string;
  data: NamedAccessOut;
  line: string;
}) {
  const all: { c: SwitchChange; where: string }[] = [
    ...data.global.history.map((c) => ({ c, where: "Every hospital" })),
    ...data.hospitals.flatMap((h) =>
      h.history.map((c) => ({ c, where: h.hospital.name })),
    ),
  ].sort((x, y) => Date.parse(y.c.at) - Date.parse(x.c.at));
  if (all.length === 0)
    return (
      <p id={id} className={`${line} mt-2`}>
        No changes yet
      </p>
    );
  return (
    <ol
      id={id}
      aria-label="Switch history"
      className="mt-2 flex flex-col gap-2"
    >
      {all.map(({ c, where }) => (
        <li
          key={`${where}-${c.at}`}
          className="rounded-xl border border-line px-4 py-3"
        >
          <p className={line}>{changeLine(c, where)}</p>
          {c.signoffs && (
            <SignoffLines
              signoffs={c.signoffs}
              className="mt-1 text-[13px] text-ink-3"
            />
          )}
        </li>
      ))}
    </ol>
  );
}

/** "Havana Hospital turned up to On · 10 Feb 2027 · requested by …, approved by …". */
function changeLine(c: SwitchChange, where: string): string {
  const way = rank(c.to) > rank(c.from) ? "up" : "down";
  const day = instantDay(c.at);
  const head = `${where} turned ${way} to ${POSITION_LABEL[c.to]}${day ? ` · ${day}` : ""}`;
  if (c.lowered_by)
    return `${head} · by ${c.lowered_by.name}${c.reason ? `: ${c.reason}` : ""}`;
  const by = [
    c.requested_by && `requested by ${c.requested_by.name}`,
    c.approved_by && `approved by ${c.approved_by.name}`,
  ].filter(Boolean);
  return by.length ? `${head} · ${by.join(", ")}` : head;
}
