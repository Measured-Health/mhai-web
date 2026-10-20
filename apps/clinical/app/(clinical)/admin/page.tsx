import { redirect } from "next/navigation";
import { ADMIN_HOME } from "@/lib/auth/types";

export default function AdminIndex() {
  redirect(ADMIN_HOME);
}
