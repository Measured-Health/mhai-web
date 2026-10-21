import type { TeamMember } from "@/lib/api/contract";
import { roleLabel } from "@/lib/labels";
import {
  MemberStatus,
  RowActions,
  signInLabel,
  TwoStep,
  type RowHandlers,
} from "./member-parts";

/** The team as cards, on phones. */
export function TeamCards({
  rows,
  ...h
}: { rows: TeamMember[] } & RowHandlers) {
  return (
    <ul aria-label="Team" className="flex flex-col gap-3">
      {rows.map((m) => (
        <li key={m.id} className="card-v3 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <b className="block [overflow-wrap:anywhere]">
                {m.name}
                {m.is_you && (
                  <small className="ml-1.5 font-normal text-ink-3">(you)</small>
                )}
              </b>
              <span className="text-[12.5px] text-ink-3 [overflow-wrap:anywhere]">
                {m.email}
              </span>
            </div>
            <MemberStatus status={m.status} />
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 text-[12.5px]">
            <div>
              <dt className="text-ink-3">Role</dt>
              <dd>{roleLabel(m.role)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Two-step</dt>
              <dd>
                <TwoStep on={m.mfa_enabled} />
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Last sign-in</dt>
              <dd>{signInLabel(m.last_sign_in_at)}</dd>
            </div>
          </dl>
          {h.canAct && (
            <div className="mt-3">
              <RowActions m={m} h={h} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
