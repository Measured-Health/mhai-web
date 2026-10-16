"use client";
import { Lock, X } from "lucide-react";
import Link from "next/link";
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

const row =
  "flex min-h-14 items-center gap-3 border-t border-line py-3 text-[14px]";
const field =
  "flex min-h-11 items-center rounded-xl border border-lilac-2 bg-white px-3.5 text-[14px]";

export function AccountView() {
  const { user, capabilities } = useAuth();
  const toast = useToast();
  const [pwOpen, setPwOpen] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  if (!user) return null;
  const fields = [
    ["Role", user.roleTitle],
    ["Specialty", user.specialty],
    ["Hospital", user.hospital],
  ].filter((r): r is [string, string] => Boolean(r[1]));
  const sections = [
    ["profile", "Profile"],
    ["security", "Security"],
    ...(capabilities.devices ? [["devices", "Devices"]] : []),
  ];

  return (
    <>
      <TopBar
        title="Profile & security"
        sub="Your account"
        leading={<MenuButton />}
        actions={
          <Link
            href="/"
            className="flex h-[34px] items-center gap-1.5 rounded-[10px] border border-line bg-white px-3 text-[12.5px] text-ink-2"
          >
            <X aria-hidden className="size-3.5" />
            Close
          </Link>
        }
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto grid max-w-[860px] gap-[26px] md:grid-cols-[200px_1fr]">
          <nav
            aria-label="Account sections"
            className="hidden flex-col gap-0.5 self-start md:sticky md:top-0 md:flex"
          >
            {sections.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded-[10px] px-3 py-2.5 text-[13.5px] text-ink-2 hover:bg-white hover:font-semibold hover:text-bloom"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex min-w-0 flex-col gap-4">
            <section
              id="profile"
              aria-label="Profile"
              className="card-v3 scroll-mt-4 px-[22px] py-5"
            >
              <div className="flex items-center gap-4">
                <Avatar name={user.displayName} className="size-16 text-xl" />
                <span className="min-w-0">
                  <h2 className="font-display text-[28px] font-black leading-none">
                    {user.fullName ?? user.displayName}
                  </h2>
                  <small className="text-[13.5px] text-ink-3">
                    {user.email ?? user.username}
                  </small>
                </span>
              </div>
              <dl className="mt-4 grid gap-x-[18px] gap-y-3 sm:grid-cols-2">
                {fields.map(([label, value]) => (
                  <div key={label}>
                    <dt className="mb-1.5 flex items-center justify-between text-[12.5px] text-ink-2">
                      {label}
                      <span className="flex items-center gap-1 text-[11px] text-ink-3">
                        <Lock aria-hidden className="size-3" />
                        from hospital records
                      </span>
                    </dt>
                    <dd className={field}>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-[13px] text-ink-3">
                Something wrong?{" "}
                <b className="font-semibold text-mint-deep">
                  Ask your hospital admin to update it
                </b>
              </p>
            </section>

            <section
              id="security"
              aria-labelledby="security-h"
              className="card-v3 scroll-mt-4 px-[22px] py-5"
            >
              <h2 id="security-h" className="text-base font-semibold">
                Security
              </h2>
              <p className="mb-3.5 mt-1 text-[13px] text-ink-3">
                Protects patient data across every session.
              </p>
              <div className={row}>
                <span className="flex-1">
                  Two-step verification
                  <small className="block text-[12px] text-ink-3">
                    Authenticator app
                  </small>
                </span>
                <span
                  className={
                    user.mfaEnabled
                      ? "rounded-full bg-ok-wash px-2.5 py-0.5 text-[11.5px] font-semibold text-ok-deep"
                      : "rounded-full bg-warn-wash px-2.5 py-0.5 text-[11.5px] font-semibold text-warn-deep"
                  }
                >
                  {user.mfaEnabled ? "On" : "Off"}
                </span>
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
              <div className={row}>
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
                <div className={row}>
                  <span className="flex-1">
                    Backup codes
                    <small className="block text-[12px] text-ink-3">
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
