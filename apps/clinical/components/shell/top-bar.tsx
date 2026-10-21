import type { ReactNode } from "react";
import type { Urgency } from "@/lib/api/contract";
import { NotificationBell } from "../notifications/notification-bell";
import { cn } from "@mhai/ui/cn";

const URG = {
  routine: "bg-mint-wash text-mint-deep",
  urgent: "bg-warn-wash text-warn-deep",
  emergency: "bg-bad-wash text-bad-deep",
} as const;

export function TopBar({
  title,
  sub,
  urgency,
  actions,
  leading,
}: {
  title: string;
  sub?: string;
  urgency?: Urgency;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <header className="relative flex items-center gap-3 border-b border-white/70 px-4 py-3.5 md:px-[26px] md:py-4">
      {leading}
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {sub && <p className="font-mono text-xs text-ink-3">{sub}</p>}
      </div>
      {urgency && (
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[.06em]",
            URG[urgency],
          )}
        >
          {urgency}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {actions}
        <NotificationBell />
      </div>
    </header>
  );
}
