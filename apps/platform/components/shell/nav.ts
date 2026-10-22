import {
  Building2,
  ChartColumn,
  HeartPulse,
  History,
  Scale,
  Settings,
  UserRound,
  Users,
} from "lucide-react";

export const NAV = [
  { href: "/hospitals", label: "Hospitals", Icon: Building2 },
  { href: "/analytics", label: "Analytics", Icon: ChartColumn },
  { href: "/legal-holds", label: "Legal holds", Icon: Scale },
  { href: "/system", label: "System", Icon: HeartPulse },
  { href: "/settings", label: "Settings", Icon: Settings },
  { href: "/team", label: "Team", Icon: Users },
  { href: "/activity", label: "Activity", Icon: History },
  { href: "/account", label: "Account", Icon: UserRound },
] as const;
