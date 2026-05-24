import { ProgrammeEditor } from "@/components/fitness/ProgrammeEditor";

export default async function ProgrammeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProgrammeEditor programmeId={id} />;
}
