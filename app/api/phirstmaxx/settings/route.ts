import { NextRequest, NextResponse } from "next/server";
import { answer, bad, pmRequest } from "@/lib/phirstmaxx/http";
import { researchStatus } from "@/lib/phirstmaxx/research/pipeline";
import { listBlockTypes, listPlaces } from "@/lib/phirstmaxx/server";
import { addPet, deletePet, deletePlace, deleteType, listPets, listWakingOverrides, meView, newInboxToken, savePlace, saveType, setWakingOverride, updatePerson } from "@/lib/phirstmaxx/settings";
import { defaultWeek } from "@/lib/phirstmaxx/week";
import { readJson } from "@/lib/tickets/server";

export const runtime = "nodejs";

/**
 * GET /api/phirstmaxx/settings — the caller's pm_people row, everyone in
 * the space, the places, block types, pets, upcoming waking overrides, the
 * research status line, and the inbox hint (the last four of the token,
 * never the token).
 */
export async function GET(req: NextRequest) {
  const r = await pmRequest(req);
  if (!r.ok) return r.res;
  const { supabase, ctx } = r;
  try {
    const [places, types, pets, waking, research] = await Promise.all([
      listPlaces(supabase, ctx.spaceId),
      listBlockTypes(supabase, ctx.spaceId),
      listPets(supabase, ctx.spaceId),
      listWakingOverrides(supabase, ctx.spaceId, defaultWeek()),
      researchStatus(supabase, ctx.spaceId).catch((e: unknown) => {
        console.error("[phirstmaxx] research status:", e);
        return null;
      }),
    ]);
    return NextResponse.json({
      me: meView(ctx),
      people: ctx.people.map((p) => ({ id: p.id, name: p.name, colour: p.colour, has_car: p.has_car })),
      places,
      types,
      pets,
      waking_overrides: waking,
      research,
      inbox: { hint: ctx.me.inbox_token_hint, path: "/api/phirstmaxx/inbox/<token>" },
    });
  } catch (err) {
    console.error("[/api/phirstmaxx/settings GET]", err);
    return bad("fetch failed", 500);
  }
}

/**
 * POST { action, space? }:
 *   person { name?, colour?, has_car?, waking?, buffers?, home_place_id?, research_cap_pence? (owner only) }
 *   place { id?, label, address?, lat?, lng?, kind?, shared? }   add, or edit when id is given
 *   delete_place { id }
 *   type { id?, name, engine_kind, colour?, default_firmness?, default_place_id?, sort? }
 *   delete_type { id }                                            409 while blocks use it
 *   pet { name, kind?, notes? }        delete_pet { id }
 *   waking_override { day, day_end | null, person_id? }           "late one tonight"; null clears it
 *   rotate_inbox_token                                            the new token, shown once
 */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return bad("bad json");
  const r = await pmRequest(req, body);
  if (!r.ok) return r.res;
  const { supabase, ctx } = r;
  try {
    const action = String(body.action ?? "");
    const id = typeof body.id === "string" ? body.id : null;
    switch (action) {
      case "person": {
        const out = await updatePerson(supabase, ctx, body);
        return out.ok ? NextResponse.json({ me: meView({ ...ctx, me: out.value }) }) : bad(out.error, out.status);
      }
      case "place":
        return answer(await savePlace(supabase, ctx, body, id), id ? 200 : 201);
      case "delete_place":
        return answer(await deletePlace(supabase, ctx, id ?? ""));
      case "type":
        return answer(await saveType(supabase, ctx, body, id), id ? 200 : 201);
      case "delete_type":
        return answer(await deleteType(supabase, ctx, id ?? ""));
      case "pet":
        return answer(await addPet(supabase, ctx, body), 201);
      case "delete_pet":
        return answer(await deletePet(supabase, ctx, id ?? ""));
      case "waking_override":
        return answer(await setWakingOverride(supabase, ctx, body));
      case "rotate_inbox_token":
        return answer(await newInboxToken(supabase, ctx));
      default:
        return bad("action is person, place, delete_place, type, delete_type, pet, delete_pet, waking_override or rotate_inbox_token.");
    }
  } catch (err) {
    console.error("[/api/phirstmaxx/settings POST]", err);
    return bad("failed", 500);
  }
}
