import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("venture_inspiration")
      .select("*")
      .order("created_at", { ascending: false });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    auditListRead(req, data, "ventures", "ventures");
    return NextResponse.json({ items: data });
  } catch (err) {
    console.error("[ventures/inspiration GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("venture_inspiration")
      .insert(body)
      .select()
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (err) {
    console.error("[ventures/inspiration POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
