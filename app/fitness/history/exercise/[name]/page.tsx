import { ExerciseHistoryClient } from "@/components/fitness/ExerciseHistoryClient";

export const dynamic = "force-dynamic";

export default async function ExerciseHistoryPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return <ExerciseHistoryClient encodedName={name} />;
}
