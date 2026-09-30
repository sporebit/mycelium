import { redirect } from "next/navigation";

/** Projects moved to Work (claude/spec-work.md §5, MYC-174). */
export default function ProjectsRedirect() {
	redirect("/work/projects");
}
