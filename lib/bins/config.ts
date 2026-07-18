import { createServerClient } from "@/lib/supabase/server";
import type { BinType, GardenSeason } from "./schedule";

export type BinConfig = {
  collection_day_of_week: number;
  anchor_date: string;
  anchor_type: BinType;
};

export async function loadBinConfig(): Promise<BinConfig | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("bin_schedule_config")
    .select("collection_day_of_week, anchor_date, anchor_type")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as BinConfig | null) ?? null;
}

export async function loadGardenSeasons(): Promise<GardenSeason[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("bin_garden_seasons")
    .select("season_start, season_end");
  return (data as GardenSeason[] | null) ?? [];
}
