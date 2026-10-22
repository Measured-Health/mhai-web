"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { getDemoHealth, setDemoHealth } from "@/lib/api/mock-ops";
import type { HealthMode } from "@/lib/api/ops-fixtures";
import { healthKey } from "@/lib/queries/ops";

const MODES: [HealthMode, string][] = [
  ["normal", "Normal"],
  ["slow", "Slower"],
  ["problem", "Problems"],
];

/** The demo only: switches the sample health reading. */
export function DemoHealthSwitch() {
  const qc = useQueryClient();
  const name = useId();
  const [mode, setMode] = useState<HealthMode>(getDemoHealth);
  if (process.env.NEXT_PUBLIC_USE_MOCK !== "true") return null;
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-dashed border-lilac-2 px-3 py-2">
      <legend className="px-1 text-[12.5px] text-ink-3">Sample data</legend>
      {MODES.map(([m, label]) => (
        <label
          key={m}
          className="inline-flex min-h-11 items-center gap-2 text-[14px]"
        >
          <input
            type="radio"
            name={name}
            checked={mode === m}
            onChange={() => {
              setMode(m);
              setDemoHealth(m);
              void qc.invalidateQueries({ queryKey: healthKey });
            }}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
