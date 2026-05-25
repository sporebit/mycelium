import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
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
  const uid = process.env.USER_ID;
  if (!uid) {
    return (
      <div className="p-6 text-danger font-[family-name:var(--font-mono)] text-sm">
        USER_ID env var is missing.
      </div>
    );
  }
  const supabase = createServerClient();
  const detail = await loadSessionDetail(supabase, id, uid);
  if (!detail) notFound();
  return <LogClient initial={detail} />;
}
