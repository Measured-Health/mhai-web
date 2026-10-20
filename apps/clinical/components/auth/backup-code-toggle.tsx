"use client";
import { useState, type Ref } from "react";
import { normalizeBackupCode } from "@/lib/auth/codes";
import { normalizeCode } from "./code-input";
import { inputClass } from "./password-fields";

/** Wording for a backup code that didn't work (spent, or mistyped). */
export const BACKUP_FAILED_BODY =
  "Check it, or it may have been used already. Each code works once.";

/**
 * A 6-digit authenticator code, or a backup code instead. Shared by the
 * sign-in code step and by removing staff, so both read and check alike.
 */
export function useCodeOrBackup() {
  const [code, setCode] = useState("");
  const [backup, setBackupState] = useState(false);
  return {
    code,
    setCode,
    backup,
    /** Switches between the two and clears what was typed. */
    setBackup(next: boolean) {
      setBackupState(next);
      setCode("");
    },
    ready: backup ? code.length === 9 : normalizeCode(code).length === 6,
    /** What to send: the digits only, or the backup code as XXXX-XXXX. */
    value: backup ? code : normalizeCode(code),
  };
}

export function BackupCodeInput({
  id,
  value,
  onChange,
  inputRef,
  disabled,
}: {
  id: string;
  value: string;
  onChange(v: string): void;
  inputRef?: Ref<HTMLInputElement>;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] text-ink-2">
        Backup code
      </label>
      <input
        ref={inputRef}
        id={id}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXX-XXXX"
        maxLength={9}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(normalizeBackupCode(e.target.value))}
        className={`${inputClass} font-mono`}
      />
    </div>
  );
}

/** "Use a backup code" / "Use your app instead". */
export function BackupCodeToggle({
  backup,
  onChange,
  prompt,
}: {
  backup: boolean;
  onChange(backup: boolean): void;
  /** Shown before "Use a backup code", e.g. "Lost your phone?". */
  prompt?: string;
}) {
  return backup ? (
    <button
      type="button"
      className="min-h-11 text-mint-deep"
      onClick={() => onChange(false)}
    >
      Use your app instead
    </button>
  ) : (
    <>
      {prompt}
      <button
        type="button"
        className="min-h-11 text-mint-deep"
        onClick={() => onChange(true)}
      >
        Use a backup code
      </button>
    </>
  );
}
