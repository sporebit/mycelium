import { redirect } from "next/navigation";

// /nutrition is now an alias for /health/nutrition — kept so existing
// bookmarks, dashboard cards, and shared links still resolve.
export default function NutritionRedirect() {
  redirect("/health/nutrition");
}
