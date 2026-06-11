import { ExerciseDetailClient } from "@/components/fitness/ExerciseDetailClient";

export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ExerciseDetailClient slug={slug} />;
}
