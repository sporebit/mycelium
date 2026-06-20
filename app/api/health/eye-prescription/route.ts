import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("eye_prescriptions")
      .select("*")
      .order("prescribed_at", { ascending: false })
      .order("eye", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ prescriptions: data });
  } catch (err) {
    console.error("[eye-prescription GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type EyeRow = {
  prescribed_at: string;
  optician?: string;
  eye: "left" | "right";
  sphere?: number;
  cylinder?: number;
  axis?: number;
  add_power?: number;
  pupillary_distance?: number;
  is_contact_lens?: boolean;
  base_curve?: number;
  diameter?: number;
  brand?: string;
  notes?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows: EyeRow[] = body.eyes;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "eyes array required" }, { status: 400 });
    }

    const supabase = createServerClient();
    const inserts = rows.map((r) => ({
      prescribed_at: r.prescribed_at,
      optician: r.optician || null,
      eye: r.eye,
      sphere: r.sphere ?? null,
      cylinder: r.cylinder ?? null,
      axis: r.axis ?? null,
      add_power: r.add_power ?? null,
      pupillary_distance: r.pupillary_distance ?? null,
      is_contact_lens: r.is_contact_lens ?? false,
      base_curve: r.base_curve ?? null,
      diameter: r.diameter ?? null,
      brand: r.brand || null,
      notes: r.notes || null,
    }));

    const { data, error } = await supabase
      .from("eye_prescriptions")
      .insert(inserts)
      .select("id, eye, prescribed_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, prescriptions: data });
  } catch (err) {
    console.error("[eye-prescription POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
