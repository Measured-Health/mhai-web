import Link from "next/link";

export default function NotFound() {
  return (
    // A <div>, not <main>: inside the clinical shell this renders in its <main>.
    <div className="canvas-v3 grid min-h-[60dvh] flex-1 place-items-center p-6 text-center">
      <div>
        <div
          aria-hidden
          className="mx-auto mb-4 grid size-20 place-items-center rounded-[26px] bg-lilac text-4xl text-bloom"
        >
          ?
        </div>
        <h1 className="font-display text-[42px] font-black leading-none">
          We can&apos;t find that
        </h1>
        <p className="mx-auto my-3 max-w-[420px] leading-relaxed text-ink-2">
          This consultation doesn&apos;t exist, or it was in a session that has
          ended.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-full bg-mint px-5 font-semibold text-white"
        >
          Back to home
        </Link>
        <p className="mt-3.5 font-mono text-xs text-ink-3">Error 404</p>
      </div>
    </div>
  );
}
