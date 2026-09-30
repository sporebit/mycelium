import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";

/** Work (claude/spec-work.md §5): every page under /work sits in the app shell. */
export default function WorkLayout({ children }: { children: ReactNode }) {
	return <Shell>{children}</Shell>;
}
