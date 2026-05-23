import { Shell } from "@/components/dashboard/Shell";
import { Operator } from "@/components/dashboard/cards/Operator";
import { Session } from "@/components/dashboard/cards/Session";
import { Habits } from "@/components/dashboard/cards/Habits";
import { Calendar } from "@/components/dashboard/cards/Calendar";
import { FinancePulse } from "@/components/dashboard/cards/FinancePulse";
import { Goals } from "@/components/dashboard/cards/Goals";
import { KeyBlockers } from "@/components/dashboard/cards/KeyBlockers";
import { Nutrition } from "@/components/dashboard/cards/Nutrition";

export default function DashboardPage() {
  const apiSecret = process.env.API_SECRET ?? "";

  return (
    <Shell
      active="HOME"
      left={
        <>
          <Operator />
          <FinancePulse />
          <Goals />
          <KeyBlockers />
        </>
      }
      centre={
        <>
          <Session apiSecret={apiSecret} />
          <Habits />
          <Calendar />
        </>
      }
      right={<Nutrition />}
    />
  );
}
