import { PersonDetail } from "@/components/compost/PersonDetail";

export const dynamic = "force-dynamic";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PersonDetail id={id} />;
}
