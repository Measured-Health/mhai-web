"use client";
import {
  useEffect,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "../ui/cn";

export const normalizeCode = (s: string) => s.replace(/\D/g, "").slice(0, 6);

/** Six boxes: auto-advance, Backspace goes back, paste fills (design 2). */
export function CodeInput({
  value,
  onChange,
  label,
  disabled,
  invalid,
  focusKey,
}: {
  value: string;
  onChange(v: string): void;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Each new value focuses the first box (e.g. after a wrong code). */
  focusKey?: number;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) =>
    refs.current[Math.max(0, Math.min(5, i))]?.focus();
  useEffect(() => {
    if (focusKey) refs.current[0]?.focus();
  }, [focusKey]);

  const setAt = (i: number, digit: string) => {
    const chars = value.padEnd(6, " ").split("");
    chars[i] = digit || " ";
    onChange(chars.join("").trimEnd());
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i]) {
      e.preventDefault();
      setAt(i - 1, "");
      focus(i - 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const code = normalizeCode(e.clipboardData.getData("text"));
    onChange(code);
    focus(code.length);
  };

  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-label={`Digit ${i + 1} of 6`}
          aria-invalid={invalid || undefined}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={value[i]?.trim() ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            const d = raw.replace(/\D/g, "").slice(-1);
            if (!raw) return setAt(i, ""); // Backspace on a filled box
            if (!d) return; // letters are ignored
            setAt(i, d);
            focus(i + 1);
          }}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          className={cn(
            "size-12 rounded-xl border border-line bg-white text-center font-mono text-[22px] font-semibold",
            "focus-visible:outline-2 focus-visible:outline-mint-deep aria-invalid:border-bad",
          )}
        />
      ))}
    </div>
  );
}
