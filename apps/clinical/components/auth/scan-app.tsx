"use client";
import { useState } from "react";
import { QrCode } from "@mhai/ui/auth/qr-code";

const grouped = (s: string) => s.match(/.{1,4}/g)?.join(" ") ?? s;

/**
 * The QR code to scan into an authenticator app, the three steps, and the
 * key to type in instead ("Can't scan? Show key"). Shared by first-time
 * setup and by moving to a new app. Nothing here is stored: the key is only
 * in the caller's memory while it is shown.
 */
export function ScanApp({
  setup,
}: {
  /** Undefined while the key is still on its way. */
  setup: { otpauthUri: string; secret: string } | null | undefined;
}) {
  const [showKey, setShowKey] = useState(false);
  return (
    <>
      <div className="mb-4 flex items-start gap-4">
        {setup && (
          <div className="flex-none rounded-2xl border border-lilac-2 bg-white p-2">
            <QrCode
              text={setup.otpauthUri}
              label="QR code for your authenticator app"
            />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-2 pt-1">
          <ol className="flex list-decimal flex-col gap-1 pl-4 text-[13px] text-ink-2 marker:font-bold marker:text-ink">
            <li>
              Open Google Authenticator, Microsoft Authenticator or similar
            </li>
            <li>Scan this code</li>
            <li>Enter the 6-digit code below</li>
          </ol>
          {setup && (
            <button
              type="button"
              aria-expanded={showKey}
              className="min-h-11 self-start text-[13px] font-semibold text-mint-deep"
              onClick={() => setShowKey((v) => !v)}
            >
              Can&apos;t scan? Show key
            </button>
          )}
        </div>
      </div>
      {setup && showKey && (
        <p className="mb-4 break-all rounded-xl bg-bg px-3 py-2 font-mono text-[15px] tracking-wider">
          {grouped(setup.secret)}
        </p>
      )}
    </>
  );
}
