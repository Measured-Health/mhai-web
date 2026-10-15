"use client";
import { Lock } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { MfaSetup } from "../auth/mfa-setup";
import { MenuButton } from "../shell/menu-button";
import { Avatar } from "../shell/account-menu";
import { TopBar } from "../shell/top-bar";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useToast } from "../ui/toast";
import { ChangePasswordDialog } from "./change-password-dialog";
import { NewBackupCodesDialog } from "./new-backup-codes-dialog";
import { DevicesSection } from "./devices-section";

const card = "rounded-3xl bg-white p-5 ring-1 ring-line";
const h2 = "font-display text-[26px] font-black leading-none";

export function AccountView() {
  const { user, capabilities } = useAuth();
  const toast = useToast();
  const [pwOpen, setPwOpen] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  if (!user) return null;
  const rows = [
    ["Role", user.roleTitle],
    ["Specialty", user.specialty],
    ["Hospital", user.hospital],
  ].filter((r): r is [string, string] => Boolean(r[1]));

  return (
    <>
      <TopBar title="Profile & security" leading={<MenuButton />} />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto flex max-w-[700px] flex-col gap-4">
          <section aria-labelledby="profile-h" className={card}>
            <h2 id="profile-h" className="sr-only">
              Profile
            </h2>
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={user.displayName} className="size-12 text-base" />
              <span>
                <b className="block text-[16px]">
                  {user.fullName ?? user.displayName}
                </b>
                <small className="text-[13px] text-ink-3">
                  {user.email ?? user.username}
                </small>
              </span>
            </div>
            <dl className="divide-y divide-line">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex min-h-12 items-center gap-3 py-2 text-[13.5px]"
                >
                  <dt className="w-28 text-ink-3">{label}</dt>
                  <dd className="flex-1">{value}</dd>
                  <dd className="flex items-center gap-1 text-[11.5px] text-ink-3">
                    <Lock aria-hidden className="size-3" />
                    from hospital records
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[13px] text-ink-3">
              Something wrong? Ask your hospital admin to update it.
            </p>
          </section>

          <section aria-labelledby="security-h" className={card}>
            <h2 id="security-h" className={h2}>
              Security
            </h2>
            <p className="mb-3 mt-1 text-[13.5px] text-ink-2">
              Protects patient data across every session.
            </p>
            <div className="flex min-h-14 items-center gap-3 border-t border-line py-2 text-[13.5px]">
              <span className="flex-1">
                Two-step verification
                <small className="block text-ink-3">Authenticator app</small>
              </span>
              <b
                className={user.mfaEnabled ? "text-ok-deep" : "text-warn-deep"}
              >
                {user.mfaEnabled ? "On" : "Off"}
              </b>
              {!user.mfaEnabled && (
                <Button
                  size="sm"
                  aria-label="Set up two-step verification"
                  onClick={() => setMfaOpen(true)}
                >
                  Set up
                </Button>
              )}
            </div>
            <div className="flex min-h-14 items-center gap-3 border-t border-line py-2 text-[13.5px]">
              <span className="flex-1">Password</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Change password"
                onClick={() => setPwOpen(true)}
              >
                Change
              </Button>
            </div>
            {user.mfaEnabled && (
              <div className="flex min-h-14 items-center gap-3 border-t border-line py-2 text-[13.5px]">
                <span className="flex-1">
                  Backup codes
                  <small className="block text-ink-3">
                    {user.backupCodesLeft !== null
                      ? `${user.backupCodesLeft} of 10 left`
                      : "Use one if you lose your phone"}
                  </small>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Get new backup codes"
                  onClick={() => setCodesOpen(true)}
                >
                  New codes
                </Button>
              </div>
            )}
          </section>

          {capabilities.devices && <DevicesSection />}
        </div>
      </div>
      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
      <NewBackupCodesDialog
        open={codesOpen}
        onClose={() => setCodesOpen(false)}
      />
      <Dialog
        open={mfaOpen}
        onClose={() => setMfaOpen(false)}
        title="Two-step verification"
      >
        {mfaOpen && (
          <MfaSetup
            onDone={() => {
              setMfaOpen(false);
              toast.show({ title: "Two-step verification is on", tone: "ok" });
            }}
          />
        )}
      </Dialog>
    </>
  );
}
