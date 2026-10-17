"use client";
import type { ReactNode } from "react";
import {
  CORRECTIONS_HREF,
  NOTIFICATIONS_HREF,
} from "@/lib/notifications/popups";
import { useDecisions } from "../corrections/decisions-provider";
import { MenuButton } from "../shell/menu-button";
import { TopBar } from "../shell/top-bar";
import { LinkTabs } from "../ui/link-tabs";
import { useAlerts } from "./alerts-provider";

/** The Notifications page: top bar, heading and the two tabs (spec §2, R2). */
export function NotificationsFrame({
  current,
  children,
}: {
  current: "alerts" | "corrections";
  children: ReactNode;
}) {
  const a = useAlerts();
  const d = useDecisions();
  const tabs = [
    {
      id: "alerts",
      href: NOTIFICATIONS_HREF,
      label: a?.unread ? `Patient alerts · ${a.unread} new` : "Patient alerts",
    },
    {
      id: "corrections",
      href: CORRECTIONS_HREF,
      label: d?.unseen ? `Corrections · ${d.unseen} new` : "Corrections",
    },
  ];
  return (
    <>
      <TopBar
        title="Notifications"
        sub="Patient alerts and decisions"
        leading={<MenuButton />}
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto max-w-[860px]">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
            Alerts and decisions
          </p>
          {/* The top bar's h1 already says "Notifications". */}
          <h2 className="mb-4 font-display text-[40px] font-black leading-none">
            Your notifications
          </h2>
          <LinkTabs
            label="Notification sections"
            tabs={tabs}
            current={current}
          />
          {children}
        </div>
      </div>
    </>
  );
}
