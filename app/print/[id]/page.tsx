"use client";
import Link from "next/link";
import { Suspense, use, useEffect, useState } from "react";
import { PrintSheet } from "@/components/print/print-sheet";
import { parseBody } from "@/components/result/parse-body";
import { useResult } from "@/lib/queries";
import { toResultView } from "@/lib/result-view";
import { useSession } from "@/lib/session-store";

// Opened by same-tab navigation, so the in-memory session and query cache
// are still there and nothing is stored.
export default function PrintPage({ params }: PageProps<"/print/[id]">) {
  return (
    <Suspense fallback={null}>
      <PrintBody params={params} />
    </Suspense>
  );
}

function PrintBody({ params }: { params: PageProps<"/print/[id]">["params"] }) {
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
        printedAt={printedAt}
      />
    </>
  );
}
