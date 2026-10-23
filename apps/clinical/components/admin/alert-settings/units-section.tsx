"use client";
import { useEffect, useId, useState } from "react";
import type { AlertSettingsOut, UnitKind } from "@/lib/api/emr-contract";
import { ConfirmDialog } from "../confirm-dialog";
import { Button } from "@mhai/ui/button";
import { SectionCard, useSectionSave } from "./section-shell";

const KINDS: readonly { kind: UnitKind; label: string }[] = [
  { kind: "ward", label: "Wards" },
  { kind: "clinic", label: "Clinics" },
  { kind: "emergency", label: "Emergency" },
  { kind: "other", label: "Other" },
];

/** Units covered: which units MHAI watches. */
export function UnitsSection({
  data,
  onDirty,
}: {
  data: AlertSettingsOut;
  onDirty(dirty: boolean): void;
}) {
  const save = useSectionSave();
  const summaryId = useId();
  const [draft, setDraft] = useState<ReadonlySet<string> | null>(null);
  const [asking, setAsking] = useState(false);
  const saved = new Set(data.units.filter((u) => u.covered).map((u) => u.id));
  const covered = draft ?? saved;
  const dirty =
    covered.size !== saved.size || [...covered].some((id) => !saved.has(id));
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const several = data.connection.sources.length > 1;
  const dropped = data.units.filter(
    (u) => saved.has(u.id) && !covered.has(u.id),
  );
  const toggle = (id: string, on: boolean) => {
    const next = new Set(covered);
    if (on) next.add(id);
    else next.delete(id);
    save.clear();
    setDraft(next);
  };
  const setAll = (on: boolean) => {
    save.clear();
    setDraft(new Set(on ? data.units.map((u) => u.id) : []));
  };
  function send() {
    setAsking(false);
    save.send(
      {
        version: data.version,
        units: {
          covered: data.units.filter((u) => covered.has(u.id)).map((u) => u.id),
        },
      },
      () => setDraft(null),
    );
  }

  return (
    <SectionCard
      title="Units covered"
      dirty={dirty}
      save={save}
      onSave={() => (dropped.length ? setAsking(true) : send())}
      onDiscard={() => {
        setDraft(null);
        save.say("Changes discarded");
      }}
      onReload={() => {
        setDraft(null);
        save.say("Latest settings loaded");
      }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p id={summaryId} className="mr-auto text-[13px] text-ink-2">
          {covered.size} of {data.units.length} units covered
        </p>
        <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
          Select all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAll(false)}>
          Clear all
        </Button>
      </div>
      {KINDS.map(({ kind, label }) => {
        const list = data.units.filter((u) => u.kind === kind);
        if (list.length === 0) return null;
        return (
          <fieldset key={kind} className="mt-2 min-w-0">
            <legend className="text-[12px] font-semibold text-ink-3">
              {label}
            </legend>
            <ul className="grid gap-x-4 sm:grid-cols-2">
              {list.map((u) => (
                <li key={u.id}>
                  <label className="flex min-h-11 items-center gap-2.5 text-[14px]">
                    <input
                      type="checkbox"
                      className="size-5 accent-mint-deep"
                      checked={covered.has(u.id)}
                      onChange={(e) => toggle(u.id, e.target.checked)}
                    />
                    <span className="[overflow-wrap:anywhere]">{u.label}</span>
                    {several && u.source_label && (
                      <small className="text-[12px] text-ink-3">
                        {u.source_label}
                      </small>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}
      <ConfirmDialog
        open={asking}
        title="Stop alerts for these units?"
        keepLabel="Keep covered"
        confirmLabel="Stop alerts"
        onKeep={() => setAsking(false)}
        onConfirm={send}
        busy={false}
        error={null}
        offline={false}
      >
        {dropped.length === 1
          ? `Patients in ${dropped[0]!.label} won't get alerts, including Critical ones.`
          : `Patients in ${dropped.length} units won't get alerts, including Critical ones.`}
      </ConfirmDialog>
    </SectionCard>
  );
}
