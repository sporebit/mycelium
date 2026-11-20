import { BudgetClient } from "@/components/finance/BudgetClient";
import { londonClock } from "@/lib/daylog/day";

export const dynamic = "force-dynamic";

/** /finance/budget — each category's monthly budget against what has been spent (master run §10). */
export default function BudgetPage() {
  return <BudgetClient initialMonth={londonClock().date.slice(0, 7)} />;
}
