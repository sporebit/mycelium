import { Shell } from "@/components/dashboard/Shell";
import { OperatorZone } from "@/components/dashboard/OperatorZone";
import { Operator } from "@/components/dashboard/cards/Operator";
import { Session } from "@/components/dashboard/cards/Session";
import { Habits } from "@/components/dashboard/cards/Habits";
import { Calendar } from "@/components/dashboard/cards/Calendar";
import { FinancePulse } from "@/components/dashboard/cards/FinancePulse";
import { Goals } from "@/components/dashboard/cards/Goals";
import { KeyBlockers } from "@/components/dashboard/cards/KeyBlockers";
import { Nutrition } from "@/components/dashboard/cards/Nutrition";
import { Fuel } from "@/components/dashboard/cards/Fuel";
import { Journal } from "@/components/dashboard/cards/Journal";
import { Fitness } from "@/components/dashboard/cards/Fitness";

export default function DashboardPage() {
  return (
    <Shell active="HOME">
      <OperatorZone />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_360px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          <Operator />
          <FinancePulse />
          <Goals />
          <KeyBlockers />
          <Fuel />
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <Session />
          <Habits />
          <Journal />
          <Calendar />
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <Nutrition />
          <Fitness />
        </div>
      </div>
    </Shell>
  );
}
