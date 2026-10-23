"use client";
import { X } from "lucide-react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useStaff } from "@/lib/admin-queries";
import type { StaffOut } from "@/lib/api/admin-contract";
import type { AlertSettingsOut } from "@/lib/api/emr-contract";
import { Chip } from "@mhai/ui/chip";
import { Switch } from "@mhai/ui/switch";
import { NO_RECIPIENTS, SectionCard, useSectionSave } from "./section-shell";

interface Person {
  id: string;
  display_name: string;
  specialty: string | null;
}

const optionText = (p: Person) =>
  p.specialty ? `${p.display_name} · ${p.specialty}` : p.display_name;

/** A combobox over the people it is given, by name and specialty. */
function AddClinician({
  options,
  onPick,
  disabled,
}: {
  options: readonly Person[];
  onPick(p: Person): void;
  disabled: boolean;
}) {
  const id = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = query.trim().toLowerCase();
  const matches = options.filter((p) =>
    optionText(p).toLowerCase().includes(q),
  );
  const current = Math.min(active, matches.length - 1);
  const optionId = (i: number) => `${listId}-${i}`;
  const expanded = open && !disabled;

  function pick(p: Person) {
    onPick(p);
    setQuery("");
    setOpen(false);
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const n = matches.length;
      if (n > 0) setActive((current + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      if (open && matches[current]) {
        e.preventDefault();
        pick(matches[current]);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative mt-2 max-w-[360px]">
      <label htmlFor={id} className="sr-only">
        Add clinician
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          expanded && current >= 0 ? optionId(current) : undefined
        }
        autoComplete="off"
        disabled={disabled}
        placeholder="Add clinician"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        className="min-h-11 w-full rounded-xl border border-lilac-2 bg-white px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-mint-deep disabled:opacity-40"
      />
      {expanded && matches.length === 0 && (
        <p className="absolute z-20 mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px] text-ink-3 shadow-lg">
          No clinicians to add
        </p>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label="Clinicians"
        hidden={!expanded || matches.length === 0}
        className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg"
      >
        {expanded &&
          matches.map((p, i) => (
            <li
              key={p.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === current}
              // Before the input's blur closes the list.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              className={`min-h-11 cursor-pointer px-3 py-2.5 text-[13.5px] ${i === current ? "bg-mint-wash" : ""}`}
            >
              {optionText(p)}
            </li>
          ))}
      </ul>
    </div>
  );
}

const isActiveClinician = (s: StaffOut) =>
  s.status === "active" && s.roles.includes("clinician");

/** Who gets alerts: the hospital queue, and named clinicians. */
export function RecipientsSection({
  data,
  onDirty,
}: {
  data: AlertSettingsOut;
  onDirty(dirty: boolean): void;
}) {
  const save = useSectionSave();
  const staff = useStaff();
  const savedIds = data.recipients.clinicians.map((c) => c.id);
  const [draft, setDraft] = useState<{
    queue: boolean;
    people: Person[];
  } | null>(null);
  const queue = draft?.queue ?? data.recipients.queue;
  const people: Person[] = draft?.people ?? data.recipients.clinicians;
  const same =
    queue === data.recipients.queue &&
    people.length === savedIds.length &&
    people.every((p) => savedIds.includes(p.id));
  const dirty = draft !== null && !same;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const none = !queue && people.length === 0;

  const offered: Person[] = (staff.data ?? [])
    .filter(isActiveClinician)
    .filter((s) => !people.some((p) => p.id === s.id))
    .map((s) => ({
      id: s.id,
      display_name: s.display_name,
      specialty: s.specialty,
    }));
  const edit = (next: { queue?: boolean; people?: Person[] }) => {
    save.clear();
    setDraft({ queue, people, ...next });
  };

  return (
    <SectionCard
      title="Who gets alerts"
      dirty={dirty}
      blocked={none ? NO_RECIPIENTS : null}
      save={save}
      onSave={() =>
        save.send(
          {
            version: data.version,
            recipients: { queue, clinician_ids: people.map((p) => p.id) },
          },
          () => setDraft(null),
        )
      }
      onDiscard={() => {
        setDraft(null);
        save.say("Changes discarded");
      }}
      onReload={() => {
        setDraft(null);
        save.say("Latest settings loaded");
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 border-b border-line pb-3">
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="text-[14px] font-semibold">Hospital queue</div>
          <p className="text-[12.5px] text-ink-3">
            A shared list every clinician at the hospital can see and act on.
          </p>
        </div>
        <Switch
          label="Hospital queue"
          checked={queue}
          onChange={(v) => edit({ queue: v })}
        />
      </div>
      <div className="pt-3">
        <div className="text-[14px] font-semibold">Named clinicians</div>
        <p className="text-[12.5px] text-ink-3">
          Named clinicians get alerts as For you, with pop-ups.
        </p>
        {people.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {people.map((p) => (
              <li key={p.id}>
                <Chip tone="brand" className="gap-1 py-0 pr-0.5 text-[12.5px]">
                  {p.display_name}
                  <button
                    type="button"
                    aria-label={`Remove ${p.display_name}`}
                    onClick={() =>
                      edit({ people: people.filter((x) => x.id !== p.id) })
                    }
                    className="grid size-11 place-items-center rounded-full hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-mint-deep sm:size-8"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </Chip>
              </li>
            ))}
          </ul>
        )}
        <AddClinician
          options={offered}
          disabled={staff.isPending}
          onPick={(p) => edit({ people: [...people, p] })}
        />
      </div>
    </SectionCard>
  );
}
