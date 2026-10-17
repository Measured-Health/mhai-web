"use client";
import { Activity, ChartColumn, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { staffState } from "@/lib/admin/staff";
import type { StaffOut } from "@/lib/api/admin-contract";
import { useStaff } from "@/lib/admin-queries";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "../ui/cn";

export const ADMIN_LINKS = [
  { href: "/admin/staff", label: "Staff", sub: null, Icon: Users },
  {
    href: "/admin/settings",
    label: "Hospital settings",
    sub: "Review rules, security, sign-in",
    Icon: Settings,
  },
  {
    href: "/admin/activity",
    label: "Activity",
    sub: "Log and review oversight",
    Icon: Activity,
  },
  {
    href: "/admin/usage",
    label: "Usage",
    sub: "Counts only",
    Icon: ChartColumn,
  },
] as const;

/**
 * "12 members · 1 invite pending", as the mockup's sidebar shows. An expired
 * invite isn't pending: it needs attention (a new invite).
 */
function staffLine(list: StaffOut[] | undefined, now: number): string | null {
  if (!list) return null;
  const members = list.filter((s) => s.status !== "deactivated").length;
  const invites = list.filter((s) => staffState(s, now) === "invited").length;
  return `${members} members · ${invites} ${invites === 1 ? "invite" : "invites"} pending`;
}

/** The sidebar's "Hospital admin" group (spec §5.6, R3). */
export function AdminNav({ rail }: { rail: boolean }) {
  const path = usePathname();
  // The staff count only on the admin side: a medical director's clinical
  // pages never load the staff list just for a count.
  const adminSide = path === "/admin" || path.startsWith("/admin/");
  const staff = useStaff({ enabled: adminSide });
  const now = useNow(60_000);
  const heading = useId();
  const lineId = useId();
  return (
    <section aria-labelledby={heading} className="mt-3">
      <h3
        id={heading}
        className={cn(
          "mx-2 mb-1.5 text-[10.5px] uppercase tracking-[.1em] text-ink-3",
          rail && "sr-only",
        )}
      >
        Hospital admin
      </h3>
      <ul className="flex flex-col gap-0.5">
        {ADMIN_LINKS.map(({ href, label, sub, Icon }, i) => {
          const on = path === href || path.startsWith(`${href}/`);
          const line =
            href === "/admin/staff"
              ? adminSide
                ? staffLine(staff.data, now)
                : null
              : sub;
          const describedBy = line ? `${lineId}-${i}` : undefined;
          return (
            <li key={href}>
              <Link
                href={href}
                title={label}
                aria-label={label}
                aria-describedby={describedBy}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-[10px] text-[13px] text-ink-2 hover:bg-bg focus-visible:outline-2 focus-visible:outline-mint-deep",
                  rail ? "w-11 justify-center" : "px-2 py-1.5",
                  on &&
                    "bg-mint-wash text-mint-deep shadow-[inset_3px_0_0_var(--color-mint)]",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg",
                    on ? "bg-white" : "bg-lilac text-bloom",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span
                  className={cn("min-w-0 leading-tight", rail && "sr-only")}
                >
                  <span className="block font-semibold">{label}</span>
                  {/* Read with the link as its description (its name is the label). */}
                  {line && (
                    <small
                      id={describedBy}
                      className="block text-[11px] text-ink-3"
                    >
                      {line}
                    </small>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
