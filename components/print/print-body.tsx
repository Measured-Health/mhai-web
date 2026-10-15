"use client";
import Link from "next/link";
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
  if (!item || !r.data)
    return (
      <p className="p-10 text-center text-ink-3">
        This result is no longer available in this session.
      </p>
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
