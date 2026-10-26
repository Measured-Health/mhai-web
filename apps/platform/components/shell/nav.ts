import {
  Building2,
  Cable,
  ChartColumn,
  FileCheck2,
  HeartPulse,
  History,
  Microscope,
  Scale,
  Settings,
  ScrollText,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AnalysisStatus } from "@/lib/api/analysis-contract";
import type { ViewState } from "@/lib/analysis/read";
import { isPlatformAdmin, type User } from "@/lib/auth/types";

/** What an entry needs before it shows: Analysis needs its switch on. */
type Need = "analysis";

export type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  need?: Need;
  /** Analysis on sample data: the entry carries a "Sample data" sign. */
  sample?: boolean;
};

export const NAV: readonly NavItem[] = [
  { href: "/hospitals", label: "Hospitals", Icon: Building2 },
  { href: "/connections", label: "Connections", Icon: Cable },
  { href: "/usage", label: "Usage", Icon: ChartColumn },
  { href: "/analysis", label: "Analysis", Icon: Microscope, need: "analysis" },
  { href: "/clearances", label: "Clearances", Icon: FileCheck2 },
  { href: "/legal-holds", label: "Legal holds", Icon: Scale },
  { href: "/system", label: "System", Icon: HeartPulse },
  { href: "/settings", label: "Settings", Icon: Settings },
  { href: "/team", label: "Team", Icon: Users },
  { href: "/activity", label: "Activity", Icon: History },
  { href: "/audit", label: "Audit log", Icon: ScrollText },
  { href: "/account", label: "Account", Icon: UserRound },
];

/**
 * The entries this person sees. Analysis shows only for a platform admin
 * whose status has read and says `aggregates_enabled`: while it loads, if it
 * fails, or when the switch is off, it stays hidden.
 */
export function visibleNav(
  user: User | null | undefined,
  status: ViewState<AnalysisStatus> | undefined,
): NavItem[] {
  const on =
    isPlatformAdmin(user) &&
    status?.status === "ok" &&
    status.data.aggregates_enabled
      ? status.data
      : null;
  return NAV.flatMap((item) => {
    if (item.need !== "analysis") return [item];
    return on ? [{ ...item, sample: on.sample }] : [];
  });
}
