import {
  Building2,
  Cable,
  ChartColumn,
  FileCheck2,
  HeartPulse,
  History,
  Scale,
  Settings,
  ScrollText,
  UserRound,
  Users,
} from "lucide-react";

export const NAV = [
  { href: "/hospitals", label: "Hospitals", Icon: Building2 },
  { href: "/connections", label: "Connections", Icon: Cable },
  { href: "/analytics", label: "Analytics", Icon: ChartColumn },
  { href: "/clearances", label: "Clearances", Icon: FileCheck2 },
  { href: "/legal-holds", label: "Legal holds", Icon: Scale },
  { href: "/system", label: "System", Icon: HeartPulse },
  { href: "/settings", label: "Settings", Icon: Settings },
  { href: "/team", label: "Team", Icon: Users },
  { href: "/activity", label: "Activity", Icon: History },
  { href: "/audit", label: "Audit log", Icon: ScrollText },
  { href: "/account", label: "Account", Icon: UserRound },
] as const;
