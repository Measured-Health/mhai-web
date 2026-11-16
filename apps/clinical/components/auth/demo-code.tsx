"use client";
import { useEffect, useState } from "react";
import { totp } from "@mhai/api-client/totp";
import { isLiveDemoBuild } from "@/lib/demo";
import { LIVE_DEMO_TOTP_SECRET } from "@/lib/auth/live-demo";

const STEP_MS = 30_000;
const systemNow = () => Date.now();

/**
 * The live demo's current two-step code, made in the browser from the
 * published demo secret (lib/auth/live-demo.ts), for the seeded two-step
 * accounts. Refreshes at each 30-second step. Nothing in any other build.
 */
export function DemoCode({ now = systemNow }: { now?: () => number }) {
  if (!isLiveDemoBuild()) return null;
  return <DemoCodeLive now={now} />;
}

function DemoCodeLive({ now }: { now: () => number }) {
  const [code, setCode] = useState<string | null>(null);
  const [left, setLeft] = useState(30);
  useEffect(() => {
    let alive = true;
    let step = -1;
    const tick = () => {
      const t = now();
      setLeft(Math.ceil((STEP_MS - (t % STEP_MS)) / 1000));
      const s = Math.floor(t / STEP_MS);
      if (s === step) return;
      step = s;
      void totp(LIVE_DEMO_TOTP_SECRET, t).then(
        (c) => alive && setCode(c),
        () => alive && setCode(null),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [now]);
  return (
    <aside
      aria-label="Demo two-step code"
      className="mt-6 rounded-2xl border border-dashed border-lilac-2 bg-lilac/40 p-4 text-[12.5px] leading-relaxed text-ink-2"
    >
      <b className="block text-ink">Demo two-step code</b>
      <p className="mt-1">
        For the demo accounts with two-step:{" "}
        <code className="font-mono text-[15px] text-ink">{code ?? "……"}</code>{" "}
        (new code in {left} s). A code someone else has just used is refused, so
        if yours is, wait for the next one.
      </p>
    </aside>
  );
}
