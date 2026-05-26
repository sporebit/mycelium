import { redirect } from "next/navigation";

export default function CRMIndex() {
  redirect("/compost/tasks");
}
