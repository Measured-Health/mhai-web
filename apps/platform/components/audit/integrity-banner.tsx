"use client";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { bannerOn } from "@/lib/audit/integrity";
import { openAuditAt } from "@/lib/audit/nav";
import { useIntegrityStatus } from "@/lib/queries/audit";
import { cn } from "@mhai/ui/cn";

// A 44 px target without moving the line around it.
const LINK =
  "-my-3 inline-block py-3 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad-deep";

/**
 * "The audit log failed its integrity check on {date}. See Integrity." (spec
 * §8.3), while the server keeps a failure open. Inside the audit view See
 * Integrity switches the tab (`onOpen`); elsewhere it links to /audit and
 * hands the tab over in memory. A status that doesn't load shows nothing.
 */
export function IntegrityBanner({
  onOpen,
  className,
}: {
  onOpen?: () => void;
  className?: string;
}) {
  const status = useIntegrityStatus();
  const { on, date } = bannerOn(status.data);
  if (!on) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 border-bad-line bg-bad-wash text-[13.5px] text-bad-deep",
        className,
      )}
    >
      <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
      <p>
        {date
          ? `The audit log failed its integrity check on ${date}. `
          : "The audit log failed its integrity check. "}
        {onOpen ? (
          <button type="button" onClick={onOpen} className={LINK}>
            See Integrity
          </button>
        ) : (
          <Link
            href="/audit"
            onClick={() => openAuditAt("integrity")}
            className={LINK}
          >
            See Integrity
          </Link>
        )}
        .
      </p>
    </div>
  );
}
