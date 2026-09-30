import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";

/** Docs (claude/spec-work.md §7): every page under /docs sits in the app shell. */
export default function DocsLayout({ children }: { children: ReactNode }) {
	return <Shell>{children}</Shell>;
}
