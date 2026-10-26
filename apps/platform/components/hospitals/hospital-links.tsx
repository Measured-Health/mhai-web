"use client";
import { ChartColumn, Microscope } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { handOffHospital } from "@/lib/analysis/scope-handoff";
import { useAuth } from "@/lib/auth/auth-context";
import { isPlatformAdmin } from "@/lib/auth/types";
import { useAnalysisStatus } from "@/lib/queries/analysis";
import { visibleNav } from "../shell/nav";

const linkClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-[13.5px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep";

/**
 * "Usage for this hospital" (the Hospitals tab on it, `?hospital=`) and,
 * when Analysis is on for this person and covers this hospital, "Analysis
 * for this hospital": One hospital on it, handed over outside the URL.
 */
export function HospitalLinks({ hospitalId }: { hospitalId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const status = useAnalysisStatus(isPlatformAdmin(user));
  const analysis =
    visibleNav(user, status).some((n) => n.href === "/analysis") &&
    status?.status === "ok" &&
    status.data.hospitals.list.some((h) => h.id === hospitalId);
  return (
    <nav aria-label="More for this hospital" className="flex flex-wrap gap-2">
      <Link
        href={`/usage?hospital=${encodeURIComponent(hospitalId)}`}
        className={linkClass}
      >
        <ChartColumn aria-hidden className="size-4" />
        Usage for this hospital
      </Link>
      {analysis && (
        <Link
          href="/analysis"
          className={linkClass}
          onClick={(e) => {
            e.preventDefault();
            handOffHospital(hospitalId);
            router.push("/analysis");
          }}
        >
          <Microscope aria-hidden className="size-4" />
          Analysis for this hospital
        </Link>
      )}
    </nav>
  );
}
