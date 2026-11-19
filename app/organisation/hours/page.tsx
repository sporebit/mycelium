import { redirect } from "next/navigation";

/** The Dashboard lands here with build part 3; until then History is the front page. */
export default function HoursPage() {
  redirect("/organisation/hours/history");
}
