import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");

  try {
    const supabase = createServerClient();
    let query = supabase
      .from("places")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ places: data ?? [] });
  } catch (err) {
    console.error("[/api/places GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreatePayload = {
  name: string;
  description?: string | null;
  category?: string;
  status?: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  google_maps_url?: string | null;
  rating?: number | null;
  visit_date?: string | null;
  notes?: string | null;
  tags?: string[];
};

function extractCoordsFromGoogleMaps(
  url: string,
): { lat: number; lng: number } | null {
  // Handle formats: @lat,lng or ?q=lat,lng or /place/lat,lng
  const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }
  const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) {
    return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let body: CreatePayload;
  try {
    body = (await req.json()) as CreatePayload;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  let lat = body.lat ?? null;
  let lng = body.lng ?? null;

  if (body.google_maps_url && lat == null) {
    const coords = extractCoordsFromGoogleMaps(body.google_maps_url);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("places")
      .insert({
        user_id: uid,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        category: body.category?.trim() || "place",
        status: body.status?.trim() || "wishlist",
        lat,
        lng,
        address: body.address?.trim() || null,
        google_maps_url: body.google_maps_url?.trim() || null,
        rating: body.rating ?? null,
        visit_date: body.visit_date || null,
        notes: body.notes?.trim() || null,
        tags: body.tags ?? [],
      })
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ place: data });
  } catch (err) {
    console.error("[/api/places POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
