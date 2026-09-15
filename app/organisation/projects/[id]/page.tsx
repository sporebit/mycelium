import { notFound } from "next/navigation";
import { createUserClient } from "@/lib/supabase/user";
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

  const supabase = await createUserClient();
  const { data } = await supabase
    .from("projects")
    .select(
      "id, name, description, status, colour, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  return <ProjectDetail initialProject={data as Project} />;
}
