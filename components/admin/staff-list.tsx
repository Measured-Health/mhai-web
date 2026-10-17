"use client";
import { Ellipsis } from "lucide-react";
import type { StaffOut } from "@/lib/api/admin-contract";
import { SIGN_IN_LABEL, lastActiveLabel, sortName } from "@/lib/admin/staff";
import { Avatar } from "../shell/account-menu";
import { RoleChips, StaffStatusChip } from "./chips";

type ListProps = {
  rows: StaffOut[];
  now: number;
  onOpen(id: string): void;
};

/** A dash on screen, a word for screen readers. */
function Missing({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden className="text-ink-3">
        —
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

function Who({ s }: { s: StaffOut }) {
  return (
    <span className="flex items-start gap-2.5">
      <Avatar name={sortName(s.full_name)} />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <b className="block font-semibold">{s.full_name}</b>
        {s.is_you && <span className="text-[12px] text-ink-3">(you)</span>}
        <small className="block text-[12px] text-ink-3">{s.email}</small>
      </span>
    </span>
  );
}

const HEADERS = [
  "Name",
  "Roles",
  "Specialty",
  "Status",
  "Signs in with",
  "Last active",
];

/** The staff table (hospital-admin.html tab 1), from `md`. */
export function StaffTable({ rows, now, onOpen }: ListProps) {
  return (
    <div className="card-v3 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-[13px]">
        <caption className="sr-only">Staff at the hospital</caption>
        <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
          <tr>
            {HEADERS.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
            <th scope="col" className="px-2 py-3">
              <span className="sr-only">Manage</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const last = lastActiveLabel(s.last_active_at, now);
            return (
              <tr
                key={s.id}
                tabIndex={0}
                onClick={() => onOpen(s.id)}
                onKeyDown={(e) => {
                  if (
                    e.target === e.currentTarget &&
                    (e.key === "Enter" || e.key === " ")
                  ) {
                    e.preventDefault();
                    onOpen(s.id);
                  }
                }}
                className="cursor-pointer border-t border-line align-top hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-deep"
              >
                <td className="px-4 py-3">
                  <Who s={s} />
                </td>
                <td className="px-4 py-3">
                  <RoleChips roles={s.roles} />
                </td>
                <td className="px-4 py-3 [overflow-wrap:anywhere]">
                  {s.specialty ?? <Missing label="None" />}
                </td>
                <td className="px-4 py-3">
                  <StaffStatusChip staff={s} now={now} />
                </td>
                <td className="px-4 py-3">
                  {s.sign_in ? (
                    SIGN_IN_LABEL[s.sign_in]
                  ) : (
                    <Missing label="Not yet" />
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-[12px]">
                  {last ?? <Missing label="Never" />}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    aria-label={`Manage ${s.full_name}`}
                    data-staff-id={s.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(s.id);
                    }}
                    className="grid size-11 place-items-center rounded-xl text-ink-3 hover:bg-lilac focus-visible:outline-2 focus-visible:outline-mint-deep"
                  >
                    <Ellipsis aria-hidden className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The same people as cards on phones (R13): every field, nothing cut off. */
export function StaffCards({ rows, now, onOpen }: ListProps) {
  return (
    <ul aria-label="Staff at the hospital" className="flex flex-col gap-2">
      {rows.map((s) => {
        const last = lastActiveLabel(s.last_active_at, now);
        const meta = [
          s.specialty,
          s.sign_in ? SIGN_IN_LABEL[s.sign_in] : null,
          last ? `Active ${last}` : null,
        ].filter(Boolean);
        return (
          <li
            key={s.id}
            className="card-v3 flex flex-col gap-2 p-3.5 text-[13px]"
          >
            <Who s={s} />
            <span className="flex flex-wrap items-center gap-1.5">
              <StaffStatusChip staff={s} now={now} />
              <RoleChips roles={s.roles} />
            </span>
            {meta.length > 0 && (
              <span className="text-[12px] text-ink-3">{meta.join(" · ")}</span>
            )}
            <button
              type="button"
              aria-label={`Manage ${s.full_name}`}
              data-staff-id={s.id}
              onClick={() => onOpen(s.id)}
              className="inline-flex min-h-11 items-center justify-center self-start rounded-full border border-line bg-white px-5 text-[13px] font-semibold text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep"
            >
              Manage
            </button>
          </li>
        );
      })}
    </ul>
  );
}
