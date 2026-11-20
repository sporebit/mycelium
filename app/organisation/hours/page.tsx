import { DashboardView } from "@/components/hours/DashboardView";

export const metadata = { title: "Hours — Mycelium" };

/** The Four-Day Week Tracker's front page: the Dashboard (spec §5). */
export default function HoursPage() {
  return <DashboardView />;
}
