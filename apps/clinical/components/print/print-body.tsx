"use client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useEffect, useState } from "react";
import { PrintSheet } from "@/components/print/print-sheet";
import { parseBody } from "@/components/result/parse-body";
import { useResult } from "@/lib/queries";
import { toResultView } from "@/lib/result-view";
import { useSession } from "@/lib/session-store";

export function PrintBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const item = useSession().get(id);
  const r = useResult(id, Boolean(item));
  const [printedAt] = useState(() => new Date().toLocaleString());
  const ready = Boolean(item && r.data);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [ready]);
  // Unknown id, or a consultation from a session that has ended.
  if (!item) notFound();
  if (!r.data)
    return (
      <div className="p-10 text-center text-ink-3">
        <p role="status">
          {r.isError
            ? "This result couldn't be loaded for printing."
            : "Preparing the printout…"}
        </p>
        {r.isError && (
          <Link
            href={`/c/${id}`}
            className="mt-3 inline-flex min-h-11 items-center text-sm text-mint-deep"
          >
            ← Back to result
          </Link>
        )}
      </div>
    );
  return (
    <>
      <Link
        href={`/c/${id}`}
        className="block p-4 text-sm text-mint-deep print:hidden"
      >
        ← Back to result
      </Link>
      <PrintSheet
        view={toResultView(r.data)}
        parsed={parseBody(r.data.response_text, r.data.citations)}
        query={item.query}
        agreedAt={item.agreedAt}
        feedback={item.feedback}
        printedAt={printedAt}
      />
    </>
  );
}
