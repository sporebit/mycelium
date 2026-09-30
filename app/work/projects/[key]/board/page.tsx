import { Suspense } from "react";
import { Board } from "@/components/work/Board";

export default async function ProjectBoardPage({ params }: { params: Promise<{ key: string }> }) {
	const { key } = await params;
	return (
		<Suspense fallback={null}>
			<Board projectKey={key} />
		</Suspense>
	);
}
