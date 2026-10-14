import { MenuButton } from "@/components/shell/menu-button";
import { TopBar } from "@/components/shell/top-bar";

export default function Home() {
  return (
    <TopBar
      title="New consultation"
      sub="Draft · not submitted"
      leading={<MenuButton />}
    />
  );
}
