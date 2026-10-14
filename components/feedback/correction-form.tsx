"use client";
import { useState } from "react";
import { correctionSchema } from "@/lib/form-schema";
import { Button } from "../ui/button";

export function CorrectionForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit(v: { corrected_diagnosis: string; reason: string }): void;
  onCancel(): void;
  busy: boolean;
}) {
  const [v, setV] = useState({ corrected_diagnosis: "", reason: "" });
  const [err, setErr] = useState<Partial<Record<keyof typeof v, string>>>({});
  const field =
    "w-full rounded-xl border border-lilac-2 bg-white px-3 py-2.5 text-sm outline-none focus:border-mint focus:ring-4 focus:ring-mint/15";
  return (
    <form
      className="mt-4 rounded-2xl border border-warn-line bg-warn-wash p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const r = correctionSchema.safeParse(v);
        if (!r.success) {
          setErr(
            Object.fromEntries(
              r.error.issues.map((i) => [i.path[0], i.message]),
            ),
          );
          return;
        }
        setErr({});
        onSubmit(r.data);
      }}
    >
      <label htmlFor="cd" className="mb-1.5 block text-[12.5px] text-warn-deep">
        What should the diagnosis or recommendation be?
      </label>
      <input
        id="cd"
        value={v.corrected_diagnosis}
        onChange={(e) => setV({ ...v, corrected_diagnosis: e.target.value })}
        className={field}
      />
      {err.corrected_diagnosis && (
        <p className="mt-1 text-xs text-bad">✕ {err.corrected_diagnosis}</p>
      )}
      <label
        htmlFor="cr"
        className="mb-1.5 mt-2.5 block text-[12.5px] text-warn-deep"
      >
        Why?{" "}
        <span aria-hidden className="text-bad">
          *
        </span>
      </label>
      <textarea
        id="cr"
        rows={2}
        value={v.reason}
        onChange={(e) => setV({ ...v, reason: e.target.value })}
        className={field}
      />
      {err.reason && <p className="mt-1 text-xs text-bad">✕ {err.reason}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="agree" disabled={busy}>
          Submit correction
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="border-0 bg-transparent"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <span className="ml-auto text-xs text-warn-deep">
          A second clinician reviews every correction.
        </span>
      </div>
    </form>
  );
}
