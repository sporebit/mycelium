import { redirect } from "next/navigation";

/** Sprints are planned on each project's Backlog (claude/spec-work.md §5). */
export default function SprintsRedirect() {
	redirect("/work/projects");
}
