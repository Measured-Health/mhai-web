"use client";
import type { ReactNode } from "react";
import type { SettingsOut } from "@/lib/api/settings-contract";
import { useSettings } from "@/lib/queries/settings";
import { TopBar } from "../shell/top-bar";
import { Loading } from "../states/loading";
import {
  PENDING_TITLE,
  PENDING_WHAT,
  PendingRequests,
} from "./pending-requests";
import {
  RETENTION_TITLE,
  RETENTION_WHAT,
  RetentionSection,
} from "./retention-section";
import { SectionFailed } from "./section-failed";

/**
 * One section of the page: its own Couldn't load when the settings can't be
 * read, else the section (which fails closed on a value it doesn't know).
 */
type Part = {
  title: string;
  what: string;
  render(s: SettingsOut): ReactNode;
};

/**
 * The sections, in order. The triage and learning data sections (Task 12)
 * are added here.
 */
const PARTS: Part[] = [
  {
    title: PENDING_TITLE,
    what: PENDING_WHAT,
    render: (s) => <PendingRequests settings={s} />,
  },
  {
    title: RETENTION_TITLE,
    what: RETENTION_WHAT,
    render: (s) => <RetentionSection settings={s} />,
  },
];

/**
 * Platform settings: the changes waiting for a second admin, then how long
 * records are kept. Platform admins change them; auditors read them.
 */
export function SettingsView() {
  const q = useSettings();
  const retry = () => void q.refetch();
  return (
    <>
      <TopBar title="Settings" sub="Platform-wide settings" />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
          {q.isPending ? (
            <Loading label="Loading settings" />
          ) : (
            PARTS.map((p) =>
              q.data ? (
                <div key={p.title}>{p.render(q.data)}</div>
              ) : (
                <SectionFailed
                  key={p.title}
                  title={p.title}
                  what={p.what}
                  onRetry={retry}
                />
              ),
            )
          )}
        </div>
      </div>
    </>
  );
}
