import {
  Building2,
  ChartColumn,
  History,
  ScrollText,
  UserRound,
  Users,
} from "lucide-react";

export const NAV = [
  { href: "/hospitals", label: "Hospitals", Icon: Building2 },
  { href: "/analytics", label: "Analytics", Icon: ChartColumn },
  { href: "/team", label: "Team", Icon: Users },
  { href: "/activity", label: "Activity", Icon: History },
  { href: "/audit", label: "Audit log", Icon: ScrollText },
  { href: "/account", label: "Account", Icon: UserRound },
] as const;
