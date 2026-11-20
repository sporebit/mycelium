import { NextResponse } from "next/server";
import { fetchWeather } from "@/lib/briefings/weather";
import { morningWords } from "@/lib/daily/prompts";
import { unauthorised, wallDevice, wallPerson } from "@/lib/system/wallRequest";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";

/**
 * GET /api/wall/person/briefing — the morning, read aloud for the unlocked
 * person: the day, the weather, the morning pick and how many things
 * follow. Composed here from parts that hold no money: the Telegram morning
 * briefing carries a finance block, so it is not what the wall reads.
 */
export async function GET() {
  const device = await wallDevice();
  if (!device) return unauthorised("wall_unpaired");
  const person = await wallPerson(device);
  if (!person) return unauthorised("locked");
  try {
    const [weather, words] = await Promise.all([
      fetchWeather().catch(() => null),
      withUser(person.uid, (db) => morningWords(db, person.uid)),
    ]);
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" }).format(new Date());
    const parts = [`Good morning. It's ${day}.`];
    if (weather) parts.push(`${weather.conditions}, ${Math.round(weather.hi)} degrees at best.`);
    parts.push(words.say);
    return NextResponse.json({ say: parts.join(" ") });
  } catch (err) {
    console.error("[wall/person/briefing]", err);
    return NextResponse.json({ error: "No briefing just now." }, { status: 500 });
  }
}
