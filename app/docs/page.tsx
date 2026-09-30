import { Suspense } from "react";
import { DocsHome } from "@/components/docs/DocsHome";

/** Doc spaces and search (claude/spec-work.md §7). */
export default function DocsPage() {
	return (
		<Suspense fallback={null}>
			<DocsHome />
		</Suspense>
	);
}
