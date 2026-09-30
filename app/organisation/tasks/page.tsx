import { redirect } from "next/navigation";

/** The Tasks surface became Work (claude/spec-work.md §5, MYC-174). */
export default function TasksRedirect() {
	redirect("/work");
}
