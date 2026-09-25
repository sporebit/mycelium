import { redirect } from "next/navigation";

/**
 * Tasks and Tickets are one surface at /organisation/tasks (tasks-merge M1,
 * MYC-163). This index redirects; ticket pages, sprints, review and
 * templates keep their /organisation/tickets/... URLs.
 */
export default function TicketsIndexRedirect() {
  redirect("/organisation/tasks");
}
