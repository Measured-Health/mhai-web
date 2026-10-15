import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { cn } from "./cn";

const TONE = {
  warn: {
    box: "bg-warn-wash border-warn-line text-warn-deep",
    Icon: AlertTriangle,
  },
  bad: { box: "bg-bad-wash border-bad-line text-bad-deep", Icon: OctagonAlert },
  ok: { box: "bg-ok-wash border-[#a8d9bf] text-ok-deep", Icon: CheckCircle2 },
  info: { box: "bg-[#fff8dc] border-[#f1df9a] text-[#7a6512]", Icon: Info },
} as const;

/** Safety banners appear once, then stay still (spec §3 Motion: never pulse). */
export function Banner({
  tone,
  title,
  children,
}: {
  tone: keyof typeof TONE;
  title: string;
  children?: ReactNode;
}) {
  const { box, Icon } = TONE[tone];
  return (
    <div
      role={tone === "bad" || tone === "warn" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-2xl border px-4 py-3.5 text-[13.5px] leading-normal",
        box,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div>
        <b className="block text-sm">{title}</b>
        {children}
      </div>
    </div>
  );
}
