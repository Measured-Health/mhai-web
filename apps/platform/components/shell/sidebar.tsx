"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@mhai/ui/brand";
import { cn } from "@mhai/ui/cn";
import { AccountMenu } from "./account-menu";
import { NAV } from "./nav";

const on = (path: string | null, href: string) =>
  path === href || Boolean(path?.startsWith(`${href}/`));

export function Sidebar() {
  const path = usePathname();
  return (
    <nav
      aria-label="Platform"
      className="relative flex h-full flex-col border-r border-line bg-gradient-to-b from-white to-bg px-3.5 py-[18px]"
    >
      <div className="px-1.5 pb-4">
        <Logo />
        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[.1em] text-bloom">
          Platform
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {NAV.map(({ href, label, Icon }) => {
          const current = on(path, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 text-[13.5px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep",
                  current
                    ? "bg-mint-wash text-mint-deep shadow-[inset_3px_0_0_var(--color-mint)]"
                    : "text-ink-2 hover:bg-bg",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg",
                    current ? "bg-white" : "bg-lilac text-bloom",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex-1" />
      <AccountMenu />
    </nav>
  );
}
