import { ReceiptsClient } from "@/components/purchases/ReceiptsClient";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ receipt?: string }>;
}) {
  const { receipt } = await searchParams;
  return <ReceiptsClient focusId={receipt ?? null} />;
}
