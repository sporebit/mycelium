import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { ProjectDetail } from "@/components/compost/ProjectDetail";
import type { Project } from "@/lib/types/project";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
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
  const { data } = await supabase
    .from("projects")
    .select(
      "id, user_id, name, description, status, colour, created_at, updated_at",
    )
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!data) notFound();

  return <ProjectDetail initialProject={data as Project} />;
}
