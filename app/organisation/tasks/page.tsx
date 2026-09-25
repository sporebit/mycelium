import { Suspense } from "react";
import { TasksHome } from "@/components/tickets/TasksHome";

/** The one Tasks surface (tasks-merge M1). /organisation/tickets redirects here. */
export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksHome />
    </Suspense>
  );
}
