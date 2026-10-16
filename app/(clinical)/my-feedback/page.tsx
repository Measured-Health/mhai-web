import type { Metadata } from "next";
import { MyCorrectionsView } from "@/components/corrections/my-corrections-view";

export const metadata: Metadata = {
  title: "My feedback & corrections · MHAI",
};

export default function MyFeedbackPage() {
  return <MyCorrectionsView />;
}
