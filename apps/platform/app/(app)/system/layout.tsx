import type { ReactNode } from "react";
import { TopBar } from "@/components/shell/top-bar";
import { SystemTabs } from "@/components/system/system-tabs";

export default function SystemLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopBar title="System" sub="Is everything working?" />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto flex max-w-[960px] flex-col gap-4">
          <SystemTabs />
          {children}
        </div>
      </div>
    </>
  );
}
