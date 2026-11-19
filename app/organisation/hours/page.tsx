import { redirect } from "next/navigation";

/** The Dashboard lands here with build part 3; until then the Log is the front page. */
export default function HoursPage() {
  redirect("/organisation/hours/log");
}
