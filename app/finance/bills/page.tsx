import { BillsClient } from "@/components/finance/BillsClient";

export const dynamic = "force-dynamic";

/** /finance/bills — bills and subscriptions found in the imported transactions (master run §10). */
export default function BillsPage() {
  return <BillsClient />;
}
