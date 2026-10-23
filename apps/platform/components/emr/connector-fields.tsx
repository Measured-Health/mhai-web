"use client";
import { useState } from "react";
import type { ConnectorType, EmrConnection } from "@/lib/api/emr-contract";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Button } from "@mhai/ui/button";
import { CredentialRow } from "./credential-row";

export type FieldKind = "settings" | "credentials";

/** The DOM id of one of the type's fields, so a form can focus it. */
export const fieldId = (prefix: string, key: string) => `${prefix}-f-${key}`;

/**
 * The fields the connection type declares, as given by the API. A secret is
 * write-only: in edit mode a saved one reads "Set · {date}" with Replace;
 * otherwise it is an empty password input.
 */
export function ConnectorFields({
  type,
  values,
  secrets,
  savedCredentials,
  errors,
  onChange,
  mode,
  idPrefix,
  disabled,
}: {
  type: ConnectorType;
  /** The text fields' values, by key. */
  values: Record<string, string>;
  /** Secrets typed so far (add, or the ones being replaced). */
  secrets: Record<string, string>;
  savedCredentials: EmrConnection["credentials"];
  errors: Partial<Record<string, string>>;
  onChange(kind: FieldKind, key: string, value: string): void;
  mode: "add" | "edit";
  idPrefix: string;
  disabled?: boolean;
}) {
  // Secrets whose input is showing although a saved one exists.
  const [replacing, setReplacing] = useState<ReadonlySet<string>>(new Set());
  const setAtOf = (key: string) =>
    savedCredentials.find((c) => c.key === key)?.set_at ?? null;
  const stop = (key: string) => {
    setReplacing((p) => {
      const n = new Set(p);
      n.delete(key);
      return n;
    });
    onChange("credentials", key, "");
  };

  return (
    <>
      {type.fields.map((f) => {
        const id = fieldId(idPrefix, f.key);
        const err = errors[f.key];
        const saved = mode === "edit" && f.kind === "secret" && setAtOf(f.key);
        if (saved && !replacing.has(f.key))
          return (
            <CredentialRow
              key={f.key}
              label={f.label}
              setAt={saved}
              disabled={disabled}
              replaceId={`${id}-replace`}
              onReplace={() => {
                setReplacing((p) => new Set(p).add(f.key));
                // The input mounts on the next render; focus it then.
                setTimeout(() => document.getElementById(id)?.focus(), 0);
              }}
            />
          );
        const secret = f.kind === "secret";
        const hint = saved
          ? "Leave empty to keep the saved value."
          : secret
            ? "It can't be shown again once saved."
            : undefined;
        const describedBy =
          [err && `${id}-err`, hint && `${id}-hint`]
            .filter(Boolean)
            .join(" ") || undefined;
        return (
          <div key={f.key}>
            <label
              htmlFor={id}
              className="mb-1.5 block text-[12.5px] text-ink-2"
            >
              {f.label}
            </label>
            <input
              id={id}
              type={secret ? "password" : "text"}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={(secret ? secrets : values)[f.key] ?? ""}
              disabled={disabled}
              aria-invalid={err ? true : undefined}
              aria-describedby={describedBy}
              onChange={(e) =>
                onChange(
                  secret ? "credentials" : "settings",
                  f.key,
                  e.target.value,
                )
              }
              className={inputClass}
            />
            {hint && (
              <p id={`${id}-hint`} className="mt-1 text-[12px] text-ink-3">
                {hint}
              </p>
            )}
            {err && (
              <p id={`${id}-err`} className="mt-1 text-[13px] text-bad">
                {err}
              </p>
            )}
            {saved && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                disabled={disabled}
                onClick={() => stop(f.key)}
              >
                Keep saved {f.label.toLowerCase()}
              </Button>
            )}
          </div>
        );
      })}
    </>
  );
}
