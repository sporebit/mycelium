import { ProjectOverview } from "@/components/work/ProjectOverview";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ key: string }> }) {
	const { key } = await params;
	return <ProjectOverview projectKey={key} />;
}
