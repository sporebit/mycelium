import { redirect } from "next/navigation";

/** Tickets became Work (claude/spec-work.md §5, MYC-174). Templates and review keep their URLs. */
export default function TicketsIndexRedirect() {
	redirect("/work");
}
