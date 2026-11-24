"use client";
import { useRouter } from "next/navigation";
import { NewBackupCodeHost } from "@mhai/ui/auth/save-backup-code";
import { LOST_PHONE_HREF } from "@/lib/auth/lost-phone";

/**
 * The new backup code after a backup code confirmed an action, shown once
 * on top of any page until Continue.
 */
export function NewBackupCode() {
  const router = useRouter();
  return (
    <NewBackupCodeHost
      lostPhone={{ href: LOST_PHONE_HREF, navigate: (h) => router.push(h) }}
    />
  );
}
