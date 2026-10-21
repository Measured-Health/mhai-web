import type { TeamMember } from "@/lib/api/contract";
import { roleLabel } from "@/lib/labels";
import {
  MemberStatus,
  RowActions,
  signInLabel,
  TwoStep,
  type RowHandlers,
} from "./member-parts";

const HEADERS = ["Name", "Email", "Role", "Status", "Two-step", "Last sign-in"];

/** The team table, from `md`. */
export function TeamTable({
  rows,
  ...h
}: { rows: TeamMember[] } & RowHandlers) {
  return (
    <div className="card-v3 overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-[13px]">
        <caption className="sr-only">Team</caption>
        <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
          <tr>
            {HEADERS.map((x) => (
              <th key={x} scope="col" className="px-4 py-3 font-semibold">
                {x}
              </th>
            ))}
            {h.canAct && (
              <th scope="col" className="px-4 py-3 font-semibold">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-t border-line">
              <th scope="row" className="px-4 py-3 text-left font-semibold">
                {m.name}
                {m.is_you && (
                  <small className="ml-1.5 font-normal text-ink-3">(you)</small>
                )}
              </th>
              <td className="px-4 py-3 [overflow-wrap:anywhere]">{m.email}</td>
              <td className="px-4 py-3">{roleLabel(m.role)}</td>
              <td className="px-4 py-3">
                <MemberStatus status={m.status} />
              </td>
              <td className="px-4 py-3">
                <TwoStep on={m.mfa_enabled} />
              </td>
              <td className="px-4 py-3">{signInLabel(m.last_sign_in_at)}</td>
              {h.canAct && (
                <td className="px-4 py-3">
                  <RowActions m={m} h={h} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
