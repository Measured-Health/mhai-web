"use client";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { MenuButton } from "../shell/menu-button";
import { TopBar } from "../shell/top-bar";

/** Every hospital admin page: top bar, hospital eyebrow and heading (mockup). */
export function AdminFrame({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const hospital = user?.hospital ?? "Your hospital";
  return (
    <>
      <TopBar
        title={title}
        sub={`Hospital admin · ${hospital}`}
        leading={<MenuButton />}
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto max-w-[1040px]">
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
                {hospital}
              </p>
              <h2 className="font-display text-[40px] font-black leading-none">
                {title}
              </h2>
            </div>
            {actions && (
              <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
            )}
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
