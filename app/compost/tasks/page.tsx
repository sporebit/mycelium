import { Suspense } from "react";
import { TasksClient } from "@/components/compost/TasksClient";

export default function CRMTasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksClient />
    </Suspense>
  );
}
