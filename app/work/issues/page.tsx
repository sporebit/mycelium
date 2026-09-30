import { Suspense } from "react";
import { IssueNavigator } from "@/components/work/IssueNavigator";

/** The issue navigator (claude/spec-work.md §5): filter bar, JQL, saved filters. `?filter=<slug>` and `?jql=`. */
export default function IssuesPage() {
	return (
		<Suspense fallback={null}>
			<IssueNavigator />
		</Suspense>
	);
}
