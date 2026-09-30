import { redirect } from "next/navigation";

/** A project's overview answers to its id as well as its key. */
export default async function ProjectRedirect({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	redirect(`/work/projects/${encodeURIComponent(id)}`);
}
