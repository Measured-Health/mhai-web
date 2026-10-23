import { CheckCircle2, CircleAlert, CirclePause, Link2Off } from "lucide-react";
import { useId } from "react";
import type {
  RecordsConnectionOut,
  RecordsStatus,
} from "@/lib/api/emr-contract";
import { ago } from "@/lib/time";
import { Chip } from "@mhai/ui/chip";

const STATUS: Record<
  RecordsStatus,
  {
    label: string;
    tone: "ok" | "warn" | "muted";
    Icon: typeof CheckCircle2;
    note: string | null;
  }
> = {
  connected: { label: "Connected", tone: "ok", Icon: CheckCircle2, note: null },
  problems: {
    label: "Connected, with problems",
    tone: "warn",
    Icon: CircleAlert,
    note: "Some updates may be late. Measured Health has been told.",
  },
  off: {
    label: "Switched off",
    tone: "muted",
    Icon: CirclePause,
    note: "Measured Health has paused this connection. No new alerts arrive until it's back.",
  },
  not_connected: {
    label: "Not connected",
    tone: "muted",
    Icon: Link2Off,
    note: "Alerts start once Measured Health connects your records. You can set them up now.",
  },
};

function lastUpdate(iso: string | null, now: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t)
    ? `last update ${ago(t, now)} ago`
    : "no update yet";
}

/** Patient records: read-only status by the hospital's own labels (never type, address or errors). */
export function RecordsStatusSection({
  connection,
  now,
}: {
  connection: RecordsConnectionOut;
  now: number;
}) {
  const id = useId();
  const s = STATUS[connection.status];
  return (
    <section aria-labelledby={id} className="card-v3 px-[22px] py-4">
      <h3
        id={id}
        className="mb-2 text-[11px] font-semibold uppercase tracking-[.1em] text-mint"
      >
        Patient records
      </h3>
      <Chip tone={s.tone}>
        <s.Icon aria-hidden className="size-3.5" />
        {s.label}
      </Chip>
      {s.note && <p className="mt-2 text-[13px] text-ink-2">{s.note}</p>}
      {connection.status !== "not_connected" &&
        connection.sources.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-[13px] text-ink-2">
            {connection.sources.map((x) => (
              <li key={x.label}>
                {x.label} · {lastUpdate(x.last_update_at, now)}
              </li>
            ))}
          </ul>
        )}
      <p className="mt-3 text-[12px] text-ink-3">
        Measured Health manages this connection. Contact them to change it.
      </p>
    </section>
  );
}
