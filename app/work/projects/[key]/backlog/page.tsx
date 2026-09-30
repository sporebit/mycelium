import { Backlog } from "@/components/work/Backlog";

export default async function ProjectBacklogPage({ params }: { params: Promise<{ key: string }> }) {
	const { key } = await params;
	return <Backlog projectKey={key} />;
}
