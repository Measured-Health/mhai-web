"use client";
import { useEffect, useId, useState } from "react";
import type { AlertSettingsOut, FlagLevel } from "@/lib/api/emr-contract";
import { FLAG_LEVELS } from "@/lib/api/emr-contract";
import { ConfirmDialog } from "../confirm-dialog";
import { SectionCard, useSectionSave } from "./section-shell";

export const LEVEL_LABEL: Record<FlagLevel, string> = {
  off: "Off",
  critical: "Critical only",
  critical_urgent: "Critical and urgent",
  all: "All (including info)",
};

const select =
  "min-h-11 rounded-xl border border-lilac-2 bg-white px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-mint-deep";

/** What to flag: one level per kind of result. */
export function RulesSection({
  data,
  onDirty,
}: {
  data: AlertSettingsOut;
  onDirty(dirty: boolean): void;
}) {
  const save = useSectionSave();
  const base = useId();
  const [draft, setDraft] = useState<Record<string, FlagLevel>>({});
  const [asking, setAsking] = useState(false);
  const level = (id: string, saved: FlagLevel) => draft[id] ?? saved;
  const changed = data.categories.filter(
    (c) => level(c.id, c.level) !== c.level,
  );
  const dirty = changed.length > 0;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const turnedOff = changed.filter((c) => level(c.id, c.level) === "off");

  function send() {
    setAsking(false);
    save.send(
      {
        version: data.version,
        rules: {
          levels: Object.fromEntries(
            data.categories.map((c) => [c.id, level(c.id, c.level)]),
          ),
        },
      },
      () => setDraft({}),
    );
  }

  return (
    <SectionCard
      title="What to flag"
      intro={
        <p className="mb-1 text-[12.5px] text-ink-3">
          Critical is the most serious. Info is for awareness only.
        </p>
      }
      dirty={dirty}
      save={save}
      onSave={() => (turnedOff.length ? setAsking(true) : send())}
      onDiscard={() => {
        setDraft({});
        save.say("Changes discarded");
      }}
      onReload={() => {
        setDraft({});
        save.say("Latest settings loaded");
      }}
    >
      <ul>
        {data.categories.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line py-2.5 first:border-t-0"
          >
            <div className="min-w-0 flex-1 basis-[200px]">
              <label
                htmlFor={`${base}-${c.id}`}
                className="text-[14px] font-semibold"
              >
                {c.label}
              </label>
              {c.example && (
                <small
                  id={`${base}-${c.id}-eg`}
                  className="block text-[12px] text-ink-3"
                >
                  {c.example}
                </small>
              )}
            </div>
            <select
              id={`${base}-${c.id}`}
              aria-describedby={c.example ? `${base}-${c.id}-eg` : undefined}
              className={select}
              value={level(c.id, c.level)}
              onChange={(e) => {
                save.clear();
                setDraft((d) => ({
                  ...d,
                  [c.id]: e.target.value as FlagLevel,
                }));
              }}
            >
              {FLAG_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={asking}
        title="Switch off these results?"
        keepLabel="Keep it on"
        confirmLabel="Switch off"
        onKeep={() => setAsking(false)}
        onConfirm={send}
        busy={false}
        error={null}
        offline={false}
      >
        {turnedOff.map((c) => (
          <span key={c.id} className="mb-1 block">
            MHAI won&apos;t flag any {c.label} results, including Critical ones.
          </span>
        ))}
      </ConfirmDialog>
    </SectionCard>
  );
}
