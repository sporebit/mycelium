import { NextResponse } from "next/server";
import { pullFromGoogle } from "@/lib/google/sync";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await pullFromGoogle();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[google/sync GET]", err);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await pullFromGoogle();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[google/sync POST]", err);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
