import { Building2, History, UserRound, Users } from "lucide-react";

export const NAV = [
  { href: "/hospitals", label: "Hospitals", Icon: Building2 },
  { href: "/team", label: "Team", Icon: Users },
  { href: "/activity", label: "Activity", Icon: History },
  { href: "/account", label: "Account", Icon: UserRound },
] as const;
