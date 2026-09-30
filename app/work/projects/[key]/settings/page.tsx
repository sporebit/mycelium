import { ProjectSettings } from "@/components/work/ProjectSettings";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ key: string }> }) {
	const { key } = await params;
	return <ProjectSettings projectKey={key} />;
}
