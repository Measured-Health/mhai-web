"use client";
import { ShieldCheck, Upload } from "lucide-react";
import { useId, useState } from "react";
import { useClearances, useNamedAccess } from "@/lib/clearance-queries";
import { accessSummary } from "@/lib/clearances/summary";
import { useNetwork } from "@mhai/api-client/network";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Skeleton } from "@mhai/ui/skeleton";
import { AdminFrame } from "../admin-frame";
import { LetterDetail } from "./letter-detail";
import { LetterList } from "./letter-list";
import { UploadDialog } from "./upload-dialog";

function Failed({ thing, retry }: { thing: string; retry(): void }) {
  return (
    <Banner tone="bad" title={`Couldn't load ${thing}`}>
      <span className="mt-2 block">
        <Button size="sm" variant="ghost" onClick={retry}>
          Try again
        </Button>
      </span>
    </Banner>
  );
}

const Note = ({ children }: { children: string }) => (
  <div role="status" className="card-v3 p-6 text-center text-[14px] text-ink-2">
    {children}
  </div>
);

/**
 * Named access (Plan 11): the hospital's clearance letters, who has named
 * access now, and uploading a new letter. With the switch Off there is
 * nothing to show but that.
 */
export function NamedAccessView() {
  const named = useNamedAccess();
  const position = named.data?.position;
  const on = position !== undefined && position !== "off";
  const q = useClearances({ enabled: on });
  const { online } = useNetwork();
  const offlineId = useId();
  const [uploading, setUploading] = useState(false);
  // The open letter: held in memory only, never the URL.
  const [openId, setOpenId] = useState<string | null>(null);

  let content;
  if (named.isError)
    content = (
      <Failed thing="named access" retry={() => void named.refetch()} />
    );
  else if (named.isPending)
    content =
      named.fetchStatus === "paused" ? (
        <Note>
          You&apos;re offline. Named access will load when you reconnect.
        </Note>
      ) : (
        <Skeleton className="h-72 rounded-2xl" />
      );
  else if (!on) content = <Note>Named access isn&apos;t available yet</Note>;
  else
    content = (
      <>
        {q.isError && (
          <div className="mb-4">
            <Failed thing="the letters" retry={() => void q.refetch()} />
          </div>
        )}
        {q.isPending ? (
          q.fetchStatus === "paused" ? (
            <Note>
              You&apos;re offline. The letters will load when you reconnect.
            </Note>
          ) : (
            <Skeleton className="h-72 rounded-2xl" />
          )
        ) : !q.data ? null : (
          <>
            <p
              role="status"
              className="card-v3 mb-4 flex items-center gap-2.5 p-4 text-[14px] font-semibold"
            >
              <ShieldCheck
                aria-hidden
                className="size-5 shrink-0 text-mint-deep"
              />
              {accessSummary(q.data.clearances, q.data.today)}
            </p>
            {q.data.clearances.length === 0 ? (
              <Note>No letters yet.</Note>
            ) : (
              <LetterList
                letters={q.data.clearances}
                today={q.data.today}
                onOpen={setOpenId}
              />
            )}
          </>
        )}
      </>
    );

  return (
    <AdminFrame
      title="Named access"
      actions={
        on && (
          <div className="flex flex-col items-end gap-1">
            <Button
              disabled={!online}
              aria-describedby={online ? undefined : offlineId}
              onClick={() => setUploading(true)}
            >
              <Upload aria-hidden className="size-4" />
              Upload a letter
            </Button>
            {!online && (
              <p id={offlineId} className="text-[12px] text-ink-3">
                You&apos;re offline. Uploading a letter needs a connection.
              </p>
            )}
          </div>
        )
      }
    >
      {content}
      <UploadDialog open={uploading} onClose={() => setUploading(false)} />
      <LetterDetail id={on ? openId : null} onClose={() => setOpenId(null)} />
    </AdminFrame>
  );
}
