import { PurchasesClient } from "@/components/compost/PurchasesClient";

export const dynamic = "force-dynamic";

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.project) ? sp.project[0] : sp.project;
  const projectId =
    typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  return <PurchasesClient initialProjectId={projectId} />;
}
