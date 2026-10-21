"use client";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@mhai/ui/button";
import { roleLabel, Avatar } from "../shell/account-menu";
import { TopBar } from "../shell/top-bar";
import { useNeedsConnection } from "../states/offline-strip";
import { BackupCodesDialog } from "./backup-codes-dialog";
import { ChangePasswordDialog } from "./change-password-dialog";
import { DevicesSection } from "./devices-section";

const row =
  "flex min-h-14 items-center gap-3 border-t border-line py-3 text-[14px]";

export function AccountView() {
  const { user } = useAuth();
  const net = useNeedsConnection();
  const [pwOpen, setPwOpen] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  if (!user) return null;
  return (
    <>
      <TopBar title="Account" sub="Your sign-in and devices" />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto flex max-w-[760px] flex-col gap-4">
          <section aria-label="Profile" className="card-v3 px-[22px] py-5">
            <div className="flex items-center gap-4">
              <Avatar name={user.name} className="size-16 text-xl" />
              <span className="min-w-0">
                <h2 className="font-display text-[28px] font-black leading-none">
                  {user.name}
                </h2>
                <small className="text-[13.5px] text-ink-3">{user.email}</small>
              </span>
            </div>
            <dl className="mt-4 grid gap-x-[18px] gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="mb-1.5 text-[12.5px] text-ink-2">Role</dt>
                <dd className="flex min-h-11 items-center rounded-xl border border-lilac-2 bg-white px-3.5 text-[14px]">
                  {roleLabel(user)}
                </dd>
              </div>
            </dl>
          </section>

          <section
            aria-labelledby="security-h"
            className="card-v3 px-[22px] py-5"
          >
            <h2 id="security-h" className="text-base font-semibold">
              Security
            </h2>
            <div className={`${row} mt-3`}>
              <span className="flex-1">
                Two-step verification
                <small className="block text-[12px] text-ink-3">
                  Always required for platform accounts
                </small>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-ok-wash px-2.5 py-0.5 text-[11.5px] font-semibold text-ok-deep">
                <CheckCircle2 aria-hidden className="size-3.5" />
                On
              </span>
            </div>
            <div className={row}>
              <span className="flex-1">Password</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={net.offline}
                title={net.props.title}
                onClick={() => setPwOpen(true)}
              >
                Change password
              </Button>
            </div>
            <div className={row}>
              <span className="flex-1">
                Backup codes
                <small className="block text-[12px] text-ink-3">
                  {user.backupCodesLeft !== null
                    ? `${user.backupCodesLeft} left`
                    : "Use one if you lose your phone"}
                </small>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={net.offline}
                title={net.props.title}
                onClick={() => setCodesOpen(true)}
              >
                New backup codes
              </Button>
            </div>
          </section>

          <DevicesSection />
        </div>
      </div>
      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
      <BackupCodesDialog open={codesOpen} onClose={() => setCodesOpen(false)} />
    </>
  );
}
