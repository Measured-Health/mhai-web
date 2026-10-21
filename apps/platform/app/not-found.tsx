import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="canvas-v3 grid min-h-full place-items-center p-6">
      <div className="card-v3 max-w-md p-8 text-center">
        <h1 className="font-display text-3xl font-black text-ink">
          Page not found
        </h1>
        <p className="mt-2 text-ink-2">
          This page doesn&apos;t exist or has moved.
        </p>
        <Link
          href="/hospitals"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-bloom underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom"
        >
          Go to hospitals
        </Link>
      </div>
    </main>
  );
}
