import { Suspense } from "react";
import { YourWork } from "@/components/work/YourWork";

/** Your work (claude/spec-work.md §5, W12). /organisation/tasks and /organisation/tickets land here. */
export default function WorkHomePage() {
	return (
		<Suspense fallback={null}>
			<YourWork />
		</Suspense>
	);
}
