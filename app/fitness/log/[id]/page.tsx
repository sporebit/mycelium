import { notFound } from "next/navigation";
import { createUserClient } from "@/lib/supabase/user";
import { loadSessionDetail } from "@/lib/fitness/session-detail";
import { LogClient } from "@/components/fitness/LogClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createUserClient();
  const detail = await loadSessionDetail(supabase, id);
  if (!detail) notFound();
  return <LogClient initial={detail} />;
}
